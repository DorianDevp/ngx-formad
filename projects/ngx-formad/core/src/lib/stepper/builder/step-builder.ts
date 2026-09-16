import { isSignal, signal } from '@angular/core';
import { Rejected } from '../../types';
import { NOT_DYNAMIC, PageCfg, StepCfg } from '../types/builder';
import { SequenceNode } from '../types/flow';
import {
  DynamicPages,
  LayoutNode,
  LayoutNodeKind,
  PageNode,
  PageOptions,
  SequenceNodeKind,
  StepNode,
} from '../types/nodes';
import { RuntimeStepperContext, StepContext, StepGate } from '../types/step-context';
import { PageBuild, PageBuilder } from './page-builder';

type MisplacedPageCfg = PageOptions | { readonly options: PageOptions };

const PAGE_ARGUMENTS = 'createPage(build, options?): the page callback comes first, the heading and subheading second';

function isPageBuild<TForms, TCtx extends RuntimeStepperContext, P>(
  value: PageBuild<TForms, TCtx, P> | MisplacedPageCfg,
): value is PageBuild<TForms, TCtx, P> {
  return typeof value === 'function';
}

/** Builds one step out of pages; `P` accumulates what the pages placed. */
export class StepBuilder<TForms, TCtx extends RuntimeStepperContext, P = {}> {
  /** Phantom: the pool names this step's pages placed. Carried by the type system, never read at runtime. */
  readonly __placed?: P;

  constructor(readonly pages: readonly PageNode[] = []) {}

  createPage<P2>(build: PageBuild<TForms, TCtx, P2>, options?: PageCfg<StepContext<TCtx, TForms>>): StepBuilder<TForms, TCtx, P & P2>;
  /** The arguments the other way round are refused here, where the mistake is, not in every step that reads this one. */
  createPage(options: MisplacedPageCfg, build?: PageBuild<TForms, TCtx, {}>): Rejected<typeof PAGE_ARGUMENTS>;
  createPage<P2>(
    first: PageBuild<TForms, TCtx, P2> | MisplacedPageCfg,
    second: PageCfg<StepContext<TCtx, TForms>> | PageBuild<TForms, TCtx, {}> = {},
  ): StepBuilder<TForms, TCtx, P & P2> | Rejected<typeof PAGE_ARGUMENTS> {
    if (!isPageBuild(first) || typeof second === 'function') throw new Error(`ngx-formad: ${PAGE_ARGUMENTS}.`);

    const page = first(new PageBuilder<TForms, TCtx, {}>());

    const options: PageOptions = {
      layout: second.layout,
      visibleWhen: second.visibleWhen,
      ...(second.heading === undefined ? {} : { heading: isSignal(second.heading) ? second.heading : signal(second.heading) }),
      ...(second.subheading === undefined
        ? {}
        : { subheading: isSignal(second.subheading) ? second.subheading : signal(second.subheading) }),
    };

    return new StepBuilder<TForms, TCtx, P & P2>([...this.pages, { options, children: page.nodes }]);
  }
}

/** A step's build callback, built once at authoring time: the step builder alone. */
export type StaticStepBuild<TForms, TCtx extends RuntimeStepperContext, P> = (
  step: StepBuilder<TForms, TCtx, {}>,
) => StepBuilder<TForms, TCtx, P>;

/** A dynamic step's build callback, run on every entry: the step builder and the live context. */
export type DynamicStepBuild<TForms, TCtx extends RuntimeStepperContext, P> = (
  step: StepBuilder<TForms, TCtx, {}>,
  ctx: TCtx,
) => StepBuilder<TForms, TCtx, P>;

/** A step's build callback as the runtime holds it; a static one fits, ignoring the context. */
export type StepBuild<TForms, TCtx extends RuntimeStepperContext, P = {}> = DynamicStepBuild<TForms, TCtx, P>;

/** What a step compiles from: its pages, its options and, inside a branch, the gate it sits under. */
export interface StepSpec<TCtx extends RuntimeStepperContext> {
  readonly pages: readonly PageNode[] | DynamicPages;

  readonly opts: StepCfg<TCtx, string>;

  readonly gate?: StepGate;
}

const AUTHORING_CONTEXT: RuntimeStepperContext = { steps: {}, shared: {}, flow: undefined, parent: undefined };

/** A step's pages: built once, now, unless the step declares `pages: StepPages.OnEntry`, then on every entry. */
export function pagesOf<TForms, TCtx extends RuntimeStepperContext, P>(
  build: StepBuild<TForms, TCtx, P>,
  onEntry: boolean,
): readonly PageNode[] | DynamicPages {
  if (!onEntry && build.length >= 2) throw new Error(`ngx-formad: ${NOT_DYNAMIC}.`);

  const pages: DynamicPages = {
    build: (ctx: TCtx) => placedOnce(build(new StepBuilder<TForms, TCtx, {}>(), ctx).pages),
  };

  return onEntry ? pages : pages.build(AUTHORING_CONTEXT);
}

/** Every form a step places sits under its own name: its instances and committed values key by it. */
function placedOnce(pages: readonly PageNode[]): readonly PageNode[] {
  const seen = new Set<string>();
  const visit = (nodes: readonly LayoutNode[]): void => {
    for (const node of nodes) {
      if (node.kind === LayoutNodeKind.Row) visit(node.children);
      if (node.kind !== LayoutNodeKind.Form) continue;
      if (seen.has(node.name)) throw new Error(`ngx-formad: a step places the form "${node.name}" twice.`);
      seen.add(node.name);
    }
  };
  for (const page of pages) visit(page.children);

  return pages;
}

/** The node under the gate as well: its own `activeWhen`, if any, is asked after the gate's. */
export function guardedBy(gate: StepGate, node: SequenceNode): SequenceNode {
  const own = node.activeWhen;

  return { ...node, activeWhen: (ctx) => gate.activeWhen(ctx) && (own ? own(ctx) : true) };
}

/**
 * A branch's selector asked once per walk: every arm compiles to its own gate, and each walk of the sequence hands
 * them one context object, so the first arm asks and the rest read the same decision.
 */
export function decidedOnce<C extends object, K>(select: (ctx: C) => K): (ctx: C) => K {
  const decisions = new WeakMap<C, K>();

  return (ctx) => {
    if (decisions.has(ctx)) return decisions.get(ctx) as K;

    const decision = select(ctx);
    decisions.set(ctx, decision);

    return decision;
  };
}

/** A step as the sequence holds it, its label made a signal and the branch gate folded into its `activeWhen`. */
export function stepNode<TCtx extends RuntimeStepperContext>(spec: StepSpec<TCtx>): SequenceNode {
  const { pages, opts, gate } = spec;
  const node: StepNode = {
    kind: SequenceNodeKind.Step,
    name: opts.name,
    pages,
    ...(opts.label === undefined ? {} : { label: isSignal(opts.label) ? opts.label : signal(opts.label) }),
    activeWhen: opts.activeWhen,
    optional: opts.optional,
    defer: opts.defer,
    completeWhen: opts.completeWhen,
    incompleteMessage: opts.incompleteMessage,
    revisit: opts.revisit,
  };

  return gate ? guardedBy(gate, node) : node;
}

/** Refuses a name a form or a step already took at this level. */
export function claimName(name: string, taken: object): void {
  if (name in taken) throw new Error(`The name '${name}' is already taken.`);
}
