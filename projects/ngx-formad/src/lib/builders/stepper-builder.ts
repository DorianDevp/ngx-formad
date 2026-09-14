import { isSignal, Provider, signal, Signal, Type } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { FormContext, PlacesCustomFields } from '../form-config/form-config';
import { Rejected } from '../form-config/rejected';
import { ControlTypeMap } from '../provide';
import { FormState } from '../renderer/instantiate-form';
import { SharedState } from '../sync/shared-state';
import { ContentBuild, buildContent } from './content';
import { ComponentCfg } from './dynamic-component';
import {
  FlowDefinition,
  FlowStepNode,
  isRecurrent,
  RecurrentFlowDefinition,
  RuntimeFlow,
  SequenceNode,
} from './flow';
import {
  DynamicPages,
  FormRevisit,
  LayoutNode,
  LayoutNodeKind,
  PageNode,
  PageOptions,
  SequenceNodeKind,
  StepNode,
  StepRevisit,
} from './nodes';
import { FormBindings, FormEffect } from '../form-config/form-bindings';
import { fieldRefs, FieldRefs, LinkPair, sharedSlots, SharedSlots } from './shared-link';
import {
  AnyFormProvider,
  ChildContext,
  ConfigOf,
  DeferTrigger,
  FormKeys,
  FormModel,
  FormPlaced,
  FormUi,
  GateContext,
  RecurrentSignals,
  RingContext,
  RootContext,
  RuntimeStepperContext,
  SharedSignals,
  StepCondition,
  StepContext,
  StepperContext,
  StepGate,
  StepInstance,
  WithShared,
  WithSteps,
} from './step-context';

/** The control kinds every stepper starts with; `addControlType` refuses to redeclare one. */
export enum ControlKind {
  Text = 'text',
  Email = 'email',
  Password = 'password',
  Tel = 'tel',
  Url = 'url',
  Textarea = 'textarea',
  Number = 'number',
  Select = 'select',
  Radio = 'radio',
  Checkbox = 'checkbox',
  Date = 'date',
  File = 'file',
}

type UnionToIntersection<U> = (U extends U ? (k: U) => void : never) extends (k: infer I) => void
  ? I
  : never;

/** `string` when `K` is a new kind; a refusal naming the clash when `TKinds` already has it. */
export type UnregisteredKind<TKinds extends string, K extends string> = K extends TKinds
  ? Rejected<`kind '${K}' is already registered; use overrideControlType`>
  : string;

/** `object` for a `FormValueControl` component class; a refusal naming the problem otherwise. */
export type ControlComponent<Cmp> = Cmp extends FormValueControl<infer _V>
  ? object
  : Rejected<'a control kind must be a FormValueControl component'>;

/** What a named step adds to the context: its instances, `| undefined` when gated by `activeWhen`. */
export type StepEntry<N extends string, Inst, O> = [N] extends [never]
  ? {}
  : Record<N, O extends { readonly activeWhen: infer _W } ? Inst | undefined : Inst>;

/** What an always-gated step adds: its instances or `undefined`. */
export type GatedEntry<N extends string, Inst> = [N] extends [never] ? {} : Record<N, Inst | undefined>;

/** The values behind one step's instances: each form's model. */
export type StepValues<Inst> = {
  readonly [F in keyof NonNullable<Inst>]: NonNullable<Inst>[F] extends FormState<infer M>
    ? M
    : NonNullable<Inst>[F];
};

/** A linear flow's egress: the named steps' values, each possibly absent. */
export type StepsCommitted<TSteps> = { readonly [K in keyof TSteps]?: StepValues<TSteps[K]> };

/** The egress shape of a built stepper, for narrowing `stepCommitted` once at the boundary. */
export type CommittedOf<S> =
  S extends Stepper<infer _F, infer TCtx, infer _R> ? StepsCommitted<TCtx['steps']> : never;

/** Placement options for a page content block. */
export interface ContentCfg<TCtx = unknown> {
  readonly layout?: string;

  readonly visibleWhen?: (ctx: TCtx) => boolean;
}

/** Placement options for a layout row; its gate takes the row's children with it. */
export interface RowCfg<TCtx = unknown> {
  readonly layout?: string;

  readonly visibleWhen?: (ctx: TCtx) => boolean;
}

/** A page as authored: its headings, its layout class and its own gate over the step context. */
export interface PageCfg<TCtx = unknown> {
  readonly heading?: string | Signal<string>;

  readonly subheading?: string | Signal<string>;

  readonly layout?: string;

  readonly visibleWhen?: (ctx: TCtx) => boolean;
}

/** The context a placed form's callbacks read: the step's level and the form's own. */
export type StepFormContext<F, TCtx extends RuntimeStepperContext, TForms = {}> = StepContext<TCtx, TForms> &
  FormContext<FormModel<F>, FormUi<F>>;

/** The bindings a placed form takes, typed by the pool template it names. */
export type PlacedFormBindings<F, TCtx extends RuntimeStepperContext> = FormBindings<
  FormModel<F>,
  FormUi<F>,
  FormPlaced<F>,
  StepFormContext<F, TCtx>
>;

/** Placement options for a pooled form: its field bindings, shared links, effects, the local `initial` seed and what a revisit does with it. */
export interface FormCfg<F, TCtx extends RuntimeStepperContext, TForms = {}> {
  readonly componentBindings?: PlacedFormBindings<F, TCtx>;
  readonly visibleWhen?: (ctx: StepContext<TCtx, TForms>) => boolean;
  readonly fieldValueBindings?: (
    fields: FieldRefs<FormModel<F>>,
    shared: SharedSlots<TCtx['shared']>,
  ) => readonly LinkPair[];
  readonly effects?: readonly FormEffect<StepFormContext<F, TCtx, TForms>>[];
  readonly initial?: (ctx: StepContext<TCtx, TForms>) => Partial<FormModel<F>>;
  readonly revisit?: FormRevisit;
}

/** Builds one page: content, components and pooled forms; `P` accumulates the placed pool names. */
export class PageBuilder<TForms, TCtx extends RuntimeStepperContext, P = {}> {
  /** Phantom: the pool names this page placed. Carried by the type system, never read at runtime. */
  readonly __placed?: P;

  constructor(readonly nodes: readonly LayoutNode[] = []) {}

  addContent(build: ContentBuild, cfg: ContentCfg<StepContext<TCtx, TForms>> = {}): PageBuilder<TForms, TCtx, P> {
    return this.with({
      kind: LayoutNodeKind.Content,
      layout: cfg.layout,
      visibleWhen: cfg.visibleWhen,
      children: buildContent(build),
    });
  }

  addComponent(component: Type<object>, cfg: ComponentCfg<StepContext<TCtx, TForms>> = {}): PageBuilder<TForms, TCtx, P> {
    const bindings = cfg.bindings ?? [];

    return this.with({
      kind: LayoutNodeKind.Component,
      component,
      bindings: typeof bindings === 'function' ? bindings : () => bindings,
      visibleWhen: cfg.visibleWhen,
      layout: cfg.layout,
    });
  }

  insertRow<P2>(
    build: (row: PageBuilder<TForms, TCtx, {}>) => PageBuilder<TForms, TCtx, P2>,
    cfg: RowCfg<StepContext<TCtx, TForms>> = {},
  ): PageBuilder<TForms, TCtx, P & P2> {
    const row = build(new PageBuilder<TForms, TCtx, {}>());

    return new PageBuilder<TForms, TCtx, P & P2>([
      ...this.nodes,
      { kind: LayoutNodeKind.Row, layout: cfg.layout, visibleWhen: cfg.visibleWhen, children: row.nodes },
    ]);
  }

  addForm<K extends FormKeys<TForms>>(
    name: K,
    cfg: FormCfg<TForms[K], TCtx, TForms> = {},
  ): PageBuilder<TForms, TCtx, P & Record<K, true>> {
    return new PageBuilder<TForms, TCtx, P & Record<K, true>>([
      ...this.nodes,
      {
        kind: LayoutNodeKind.Form,
        name,
        visibleWhen: cfg.visibleWhen,
        links: cfg.fieldValueBindings?.(fieldRefs<FormModel<TForms[K]>>(), sharedSlots<TCtx['shared']>()) ?? [],
        bindings: cfg.componentBindings ?? {},
        effects: (cfg.effects ?? []).map((run) => ({ run })),
        initial: cfg.initial,
        revisit: cfg.revisit,
      },
    ]);
  }

  private with(node: LayoutNode): PageBuilder<TForms, TCtx, P> {
    return new PageBuilder<TForms, TCtx, P>([...this.nodes, node]);
  }
}

/** A page's build callback; what it places accumulates in `P`. */
export type PageBuild<TForms, TCtx extends RuntimeStepperContext, P> = (
  page: PageBuilder<TForms, TCtx, {}>,
) => PageBuilder<TForms, TCtx, P>;

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

/** When a step's pages are built: once, at authoring time, or again on every entry over the live context. */
export enum StepPages {
  Once = 'once',
  OnEntry = 'on-entry',
}

const NOT_DYNAMIC = 'a step whose callback takes ctx must declare pages: StepPages.OnEntry';

/** The refusal a `(step, ctx)` callback meets when its step does not declare `pages: StepPages.OnEntry`. */
export type NotDynamic = Rejected<typeof NOT_DYNAMIC>;

/** Per-step config; `name` is the key successors read the step under, `pages` says when its pages are built. */
export interface StepCfg<TCtx extends RuntimeStepperContext, N extends string = never> {
  readonly name?: N;

  readonly pages?: StepPages;

  readonly label?: string | Signal<string>;

  readonly activeWhen?: StepCondition<TCtx>;

  readonly optional?: boolean;

  readonly defer?: DeferTrigger;

  readonly completeWhen?: StepCondition<TCtx>;

  readonly incompleteMessage?: string;

  readonly revisit?: StepRevisit;
}

/** The config of a step built once; `pages` may only say so. */
export type StaticStepCfg<TCtx extends RuntimeStepperContext, N extends string = never> = StepCfg<TCtx, N> & {
  readonly pages?: StepPages.Once;
};

/** The config of a step built on every entry; `pages: StepPages.OnEntry` is required. */
export type DynamicStepCfg<TCtx extends RuntimeStepperContext, N extends string = never> = StepCfg<TCtx, N> & {
  readonly pages: StepPages.OnEntry;
};

/** A branch selector: the branch key, or null/undefined to select no arm. Asked once the steps before the branch are entered. */
export type BranchSelect<TCtx extends RuntimeStepperContext, K extends string> = (ctx: TCtx) => K | null | undefined;

/** The entries every arm of a `branch` adds, merged. */
export type BranchAdded<B> = UnionToIntersection<
  { [K in keyof B]: B[K] extends (b: never) => { __added?: infer A } ? A : never }[keyof B]
>;

type PushStep = (node: SequenceNode) => void;

interface StepSpec<TCtx extends RuntimeStepperContext> {
  readonly pages: readonly PageNode[] | DynamicPages;

  readonly opts: StepCfg<TCtx, string>;

  readonly gate?: StepGate;
}

const AUTHORING_CONTEXT: RuntimeStepperContext = { steps: {}, shared: {}, flow: undefined, parent: undefined };

/** A step's pages: built once, now, unless the step declares `pages: StepPages.OnEntry`, then on every entry. */
function pagesOf<TForms, TCtx extends RuntimeStepperContext, P>(
  build: StepBuild<TForms, TCtx, P>,
  onEntry: boolean,
): readonly PageNode[] | DynamicPages {
  if (!onEntry && build.length >= 2) throw new Error(`ngx-formad: ${NOT_DYNAMIC}.`);

  const pages: DynamicPages = { build: (ctx: TCtx) => build(new StepBuilder<TForms, TCtx, {}>(), ctx).pages };

  return onEntry ? pages : pages.build(AUTHORING_CONTEXT);
}

function guardedBy(gate: StepGate, node: SequenceNode): SequenceNode {
  const own = node.activeWhen;

  return { ...node, activeWhen: (ctx) => gate.activeWhen(ctx) && (own ? own(ctx) : true) };
}

/**
 * A branch's selector asked once per walk: every arm compiles to its own gate, and each walk of the sequence hands
 * them one context object, so the first arm asks and the rest read the same decision.
 */
function decidedOnce<C extends object, K>(select: (ctx: C) => K): (ctx: C) => K {
  const decisions = new WeakMap<C, K>();

  return (ctx) => {
    if (decisions.has(ctx)) return decisions.get(ctx) as K;

    const decision = select(ctx);
    decisions.set(ctx, decision);

    return decision;
  };
}

function stepNode<TCtx extends RuntimeStepperContext>(spec: StepSpec<TCtx>): SequenceNode {
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

function claimName(name: string, taken: object): void {
  if (name in taken) throw new Error(`The name '${name}' is already taken.`);
}

/** Authors the steps of one branch; each is guarded by the branch condition. */
export class BranchBuilder<TForms, TCtx extends RuntimeStepperContext, TAdded = {}> {
  /** Phantom: the step entries this arm adds to the context. Carried by the type system, never read at runtime. */
  readonly __added?: TAdded;

  constructor(
    private readonly push: PushStep,
    private readonly gate: StepGate,
  ) {}

  createStep<
    N extends string = never,
    P = {},
    O extends StaticStepCfg<WithSteps<TCtx, TAdded & GatedEntry<N, StepInstance<TForms, P>>>, N> = StaticStepCfg<
      WithSteps<TCtx, TAdded & GatedEntry<N, StepInstance<TForms, P>>>,
      N
    >,
  >(
    build: StaticStepBuild<TForms, WithSteps<TCtx, TAdded>, P>,
    opts?: O & { readonly name?: N },
  ): BranchBuilder<TForms, TCtx, TAdded & GatedEntry<N, StepInstance<TForms, P>>>;
  createStep<
    N extends string = never,
    P = {},
    O extends DynamicStepCfg<WithSteps<TCtx, TAdded & GatedEntry<N, StepInstance<TForms, P>>>, N> = DynamicStepCfg<
      WithSteps<TCtx, TAdded & GatedEntry<N, StepInstance<TForms, P>>>,
      N
    >,
  >(
    build: DynamicStepBuild<TForms, WithSteps<TCtx, TAdded>, P>,
    opts: O & { readonly name?: N },
  ): BranchBuilder<TForms, TCtx, TAdded & GatedEntry<N, StepInstance<TForms, P>>>;
  createStep(
    build: DynamicStepBuild<TForms, WithSteps<TCtx, TAdded>, {}> & NotDynamic,
    opts?: StepCfg<WithSteps<TCtx, TAdded>, string>,
  ): never;
  createStep<N extends string = never, P = {}>(
    build: DynamicStepBuild<TForms, WithSteps<TCtx, TAdded>, P>,
    opts: StepCfg<WithSteps<TCtx, TAdded & GatedEntry<N, StepInstance<TForms, P>>>, N> = {},
  ): BranchBuilder<TForms, TCtx, TAdded & GatedEntry<N, StepInstance<TForms, P>>> {
    this.push(stepNode({ pages: pagesOf(build, opts.pages === StepPages.OnEntry), opts, gate: this.gate }));

    return new BranchBuilder<TForms, TCtx, TAdded & GatedEntry<N, StepInstance<TForms, P>>>(
      this.push,
      this.gate,
    );
  }

  branch<
    K extends string,
    B extends Record<K, (b: BranchBuilder<TForms, WithSteps<TCtx, TAdded>, {}>) => { __added?: unknown }>,
  >(
    select: BranchSelect<WithSteps<TCtx, TAdded>, K>,
    branches: B,
  ): BranchBuilder<TForms, TCtx, TAdded & BranchAdded<B>> {
    const decide = decidedOnce(select);
    for (const key in branches) {
      const nested: StepGate = {
        activeWhen: (ctx: WithSteps<TCtx, TAdded>) => {
          if (!this.gate.activeWhen(ctx)) return false;

          const selected: string | null | undefined = decide(ctx);

          return selected === key;
        },
      };
      branches[key](new BranchBuilder<TForms, WithSteps<TCtx, TAdded>, {}>(this.push, nested));
    }

    return new BranchBuilder<TForms, TCtx, TAdded & BranchAdded<B>>(this.push, this.gate);
  }
}

interface ArmState {
  readonly forms: Readonly<Record<string, AnyFormProvider>>;

  readonly shared: SharedState;

  readonly steps: readonly SequenceNode[];
}

/** One finished fork arm: its pool, state slice, steps and typed result resolver. */
export interface ForkArm<R = unknown> extends ArmState {
  readonly __result?: R;

  resolve(ctx: RuntimeStepperContext): R;
}

const EMPTY_ARM: ArmState = { forms: {}, shared: new SharedState({}), steps: [] };

/** Authors one fork arm: its own state, forms and steps, ending in `result`. */
export class ForkArmBuilder<TForms, TCtx extends RuntimeStepperContext, TAdded = {}> {
  constructor(private readonly arm: ArmState = EMPTY_ARM) {}

  withState<S extends Record<string, unknown>>(initial: S): ForkArmBuilder<TForms, WithShared<TCtx, S>, TAdded> {
    return new ForkArmBuilder<TForms, WithShared<TCtx, S>, TAdded>({
      ...this.arm,
      shared: new SharedState({ ...this.arm.shared.snapshot(), ...initial }),
    });
  }

  createForm<K extends string, F extends AnyFormProvider>(
    name: K,
    provider: F & PlacesCustomFields<FormUi<F>, FormPlaced<F>>,
  ): ForkArmBuilder<TForms & Record<K, ConfigOf<F>>, TCtx, TAdded> {
    claimName(name, this.arm.forms);

    return new ForkArmBuilder<TForms & Record<K, ConfigOf<F>>, TCtx, TAdded>({
      ...this.arm,
      forms: { ...this.arm.forms, [name]: provider },
    });
  }

  createStep<
    N extends string = never,
    P = {},
    O extends StaticStepCfg<WithSteps<TCtx, TAdded & GatedEntry<N, StepInstance<TForms, P>>>, N> = StaticStepCfg<
      WithSteps<TCtx, TAdded & GatedEntry<N, StepInstance<TForms, P>>>,
      N
    >,
  >(
    build: StaticStepBuild<TForms, WithSteps<TCtx, TAdded>, P>,
    opts?: O & { readonly name?: N },
  ): ForkArmBuilder<TForms, TCtx, TAdded & GatedEntry<N, StepInstance<TForms, P>>>;
  createStep<
    N extends string = never,
    P = {},
    O extends DynamicStepCfg<WithSteps<TCtx, TAdded & GatedEntry<N, StepInstance<TForms, P>>>, N> = DynamicStepCfg<
      WithSteps<TCtx, TAdded & GatedEntry<N, StepInstance<TForms, P>>>,
      N
    >,
  >(
    build: DynamicStepBuild<TForms, WithSteps<TCtx, TAdded>, P>,
    opts: O & { readonly name?: N },
  ): ForkArmBuilder<TForms, TCtx, TAdded & GatedEntry<N, StepInstance<TForms, P>>>;
  createStep(
    build: DynamicStepBuild<TForms, WithSteps<TCtx, TAdded>, {}> & NotDynamic,
    opts?: StepCfg<WithSteps<TCtx, TAdded>, string>,
  ): never;
  createStep<N extends string = never, P = {}>(
    build: DynamicStepBuild<TForms, WithSteps<TCtx, TAdded>, P>,
    opts: StepCfg<WithSteps<TCtx, TAdded & GatedEntry<N, StepInstance<TForms, P>>>, N> = {},
  ): ForkArmBuilder<TForms, TCtx, TAdded & GatedEntry<N, StepInstance<TForms, P>>> {
    return new ForkArmBuilder<TForms, TCtx, TAdded & GatedEntry<N, StepInstance<TForms, P>>>({
      ...this.arm,
      steps: [...this.arm.steps, stepNode({ pages: pagesOf(build, opts.pages === StepPages.OnEntry), opts })],
    });
  }

  branch<
    K extends string,
    B extends Record<K, (b: BranchBuilder<TForms, WithSteps<TCtx, TAdded>, {}>) => { __added?: unknown }>,
  >(
    select: BranchSelect<WithSteps<TCtx, TAdded>, K>,
    branches: B,
  ): ForkArmBuilder<TForms, TCtx, TAdded & BranchAdded<B>> {
    const steps: SequenceNode[] = [];
    const decide = decidedOnce(select);
    for (const key in branches) {
      const gate: StepGate = {
        activeWhen: (ctx: WithSteps<TCtx, TAdded>) => {
          const selected: string | null | undefined = decide(ctx);

          return selected === key;
        },
      };
      branches[key](new BranchBuilder<TForms, WithSteps<TCtx, TAdded>, {}>((node) => steps.push(node), gate));
    }

    return new ForkArmBuilder<TForms, TCtx, TAdded & BranchAdded<B>>({
      ...this.arm,
      steps: [...this.arm.steps, ...steps],
    });
  }

  result<R>(resolve: (ctx: GateContext<WithSteps<TCtx, TAdded>>) => R): ForkArm<R> {
    return { ...this.arm, resolve };
  }
}

/** A forked chain: nothing may follow, only `build()`. */
export interface TerminalForkBuilder<TForms, TCtx extends RuntimeStepperContext, TResult> {
  build(): Stepper<TForms, TCtx, TResult>;
}

type ForkArms<TForms, TCtx extends RuntimeStepperContext> = Record<
  string,
  (arm: ForkArmBuilder<TForms, TCtx>) => ForkArm
>;

type ArmResult<A> = {
  [P in keyof A]: A[P] extends (arm: never) => ForkArm<infer R> ? R : never;
}[keyof A];

/** A built linear flow: the runtime shape plus the authoring types it was built with. */
export class Stepper<TForms = {}, TCtx extends RuntimeStepperContext = RuntimeStepperContext, TResult = unknown>
  implements FlowDefinition
{
  readonly __forms?: TForms;

  readonly __context?: TCtx;

  readonly __result?: TResult;

  readonly forms: Readonly<Record<string, AnyFormProvider>>;

  readonly steps: readonly SequenceNode[];

  readonly shared: SharedState;

  readonly resolveResult?: FlowDefinition['resolveResult'];

  readonly controlTypes: ControlTypeMap;

  readonly providers: readonly Provider[];

  constructor(definition: FlowDefinition) {
    this.forms = definition.forms;
    this.steps = definition.steps;
    this.shared = definition.shared;
    this.resolveResult = definition.resolveResult;
    this.controlTypes = definition.controlTypes;
    this.providers = definition.providers;
  }
}

/** A linear flow with its authoring types erased, as `<ngx-formad-stepper>` takes it. */
export type RuntimeStepper = Stepper;

/** The parent-side options of a nested flow slot. */
export interface FlowSlotCfg<TCtx extends RuntimeStepperContext> {
  readonly label?: string | Signal<string>;

  readonly activeWhen?: StepCondition<TCtx>;

  readonly defer?: DeferTrigger;
}

/** A ring's accumulator: the state it starts from and, optionally, when the dock counts as reachable. */
export interface RingCfg<C> {
  readonly state: () => C;

  readonly dockReachable?: (state: C) => boolean;
}

/**
 * The dock's own config. The dock is the ring's terminal - the only way out - so nothing gates it away (`activeWhen`),
 * nothing skips it (`optional`) and it is not rebuilt behind the user's back (`revisit`); its `completeWhen` is the
 * flow's contract, read over `ctx.flow.state()`.
 */
export type DockCfg<TCtx extends RuntimeStepperContext, N extends string = never> = Omit<
  StepCfg<TCtx, N>,
  'activeWhen' | 'optional' | 'revisit'
>;

/** A nested linear flow: slot options plus the callback authoring the sub-flow. */
export type LinearFlowStep<TKinds extends string, TCtx extends RuntimeStepperContext, TBuilt> = FlowSlotCfg<TCtx> & {
  readonly build: (sub: StepperBuilder<{}, TKinds, ChildContext<TCtx>>) => TBuilt;
};

/** A nested ring: slot options, its accumulator and the callback authoring the ring, ending in `dock`. */
export type RecurrentFlowStep<C, TKinds extends string, TCtx extends RuntimeStepperContext, TTerminal> = FlowSlotCfg<TCtx> &
  RingCfg<C> & {
    readonly build: (loop: RecurrentStepperBuilder<{}, C, TKinds, RingContext<TCtx, C>>) => TTerminal;
  };

interface FlowSlot<TCtx extends RuntimeStepperContext> {
  readonly name: string;

  readonly flow: RuntimeFlow;

  readonly opts: FlowSlotCfg<TCtx>;
}

function flowStepNode<TCtx extends RuntimeStepperContext>(slot: FlowSlot<TCtx>): FlowStepNode {
  return {
    kind: SequenceNodeKind.Flow,
    name: slot.name,
    flow: slot.flow,
    ...(slot.opts.label === undefined ? {} : { label: isSignal(slot.opts.label) ? slot.opts.label : signal(slot.opts.label) }),
    activeWhen: slot.opts.activeWhen,
    defer: slot.opts.defer,
  };
}

interface ChainState {
  readonly forms: Readonly<Record<string, AnyFormProvider>>;

  readonly shared: SharedState;

  readonly steps: readonly SequenceNode[];

  readonly controlTypes: ControlTypeMap;

  readonly providers: readonly Provider[];

  readonly stepNames: Readonly<Record<string, true>>;
}

const EMPTY_CHAIN: ChainState = {
  forms: {},
  shared: new SharedState({}),
  steps: [],
  controlTypes: {},
  providers: [],
  stepNames: {},
};

function claimedStep(taken: Readonly<Record<string, true>>, node: SequenceNode): Readonly<Record<string, true>> {
  if (node.name === undefined) return taken;
  claimName(node.name, taken);

  return { ...taken, [node.name]: true };
}

function claimedForm(
  taken: Readonly<Record<string, AnyFormProvider>>,
  [name, provider]: readonly [string, AnyFormProvider],
): Readonly<Record<string, AnyFormProvider>> {
  claimName(name, taken);

  return { ...taken, [name]: provider };
}

/** The root of a linear chain; `build()` freezes it into a `Stepper`. */
export class StepperBuilder<
  TForms = {},
  TKinds extends string = ControlKind,
  TCtx extends RuntimeStepperContext = RootContext,
> {
  readonly __forms?: TForms;

  readonly __context?: TCtx;

  constructor(private readonly chain: ChainState = EMPTY_CHAIN) {}

  addControlType<K extends string, Cmp extends object>(
    kind: K & UnregisteredKind<TKinds, K>,
    component: Type<Cmp> & ControlComponent<Cmp>,
  ): StepperBuilder<TForms, TKinds | K, TCtx> {
    return new StepperBuilder<TForms, TKinds | K, TCtx>({
      ...this.chain,
      controlTypes: { ...this.chain.controlTypes, [kind]: component },
    });
  }

  overrideControlType<K extends TKinds, Cmp extends object>(
    kind: K,
    component: Type<Cmp> & ControlComponent<Cmp>,
  ): StepperBuilder<TForms, TKinds, TCtx> {
    return new StepperBuilder<TForms, TKinds, TCtx>({
      ...this.chain,
      controlTypes: { ...this.chain.controlTypes, [kind]: component },
    });
  }

  provide(...providers: Provider[]): StepperBuilder<TForms, TKinds, TCtx> {
    return new StepperBuilder<TForms, TKinds, TCtx>({
      ...this.chain,
      providers: [...this.chain.providers, ...providers],
    });
  }

  withState<S extends Record<string, unknown>>(initial: S): StepperBuilder<TForms, TKinds, WithShared<TCtx, S>> {
    return new StepperBuilder<TForms, TKinds, WithShared<TCtx, S>>({
      ...this.chain,
      shared: new SharedState({ ...this.chain.shared.snapshot(), ...initial }),
    });
  }

  createForm<K extends string, F extends AnyFormProvider>(
    name: K,
    provider: F & PlacesCustomFields<FormUi<F>, FormPlaced<F>>,
  ): StepperBuilder<TForms & Record<K, ConfigOf<F>>, TKinds, TCtx> {
    claimName(name, this.chain.forms);

    return new StepperBuilder<TForms & Record<K, ConfigOf<F>>, TKinds, TCtx>({
      ...this.chain,
      forms: { ...this.chain.forms, [name]: provider },
    });
  }

  createStep<
    N extends string = never,
    P = {},
    O extends StaticStepCfg<WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>, N> = StaticStepCfg<
      WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>,
      N
    >,
  >(
    build: StaticStepBuild<TForms, TCtx, P>,
    opts?: O & { readonly name?: N },
  ): StepperBuilder<TForms, TKinds, WithSteps<TCtx, StepEntry<N, StepInstance<TForms, P>, O>>>;
  createStep<
    N extends string = never,
    P = {},
    O extends DynamicStepCfg<WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>, N> = DynamicStepCfg<
      WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>,
      N
    >,
  >(
    build: DynamicStepBuild<TForms, TCtx, P>,
    opts: O & { readonly name?: N },
  ): StepperBuilder<TForms, TKinds, WithSteps<TCtx, StepEntry<N, StepInstance<TForms, P>, O>>>;
  createStep(build: DynamicStepBuild<TForms, TCtx, {}> & NotDynamic, opts?: StepCfg<TCtx, string>): never;
  createStep<N extends string = never, P = {}, O extends StepCfg<WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>, N> = {}>(
    build: DynamicStepBuild<TForms, TCtx, P>,
    opts?: O & { readonly name?: N },
  ): StepperBuilder<TForms, TKinds, WithSteps<TCtx, StepEntry<N, StepInstance<TForms, P>, O>>> {
    return new StepperBuilder<TForms, TKinds, WithSteps<TCtx, StepEntry<N, StepInstance<TForms, P>, O>>>(
      this.appended([stepNode({ pages: pagesOf(build, opts?.pages === StepPages.OnEntry), opts: opts ?? {} })]),
    );
  }

  branch<
    K extends string,
    B extends Record<K, (b: BranchBuilder<TForms, TCtx, {}>) => { __added?: unknown }>,
  >(
    select: BranchSelect<TCtx, K>,
    branches: B,
  ): StepperBuilder<TForms, TKinds, WithSteps<TCtx, BranchAdded<B>>> {
    const steps: SequenceNode[] = [];
    const decide = decidedOnce(select);
    for (const key in branches) {
      const gate: StepGate = {
        activeWhen: (ctx: TCtx) => {
          const selected: string | null | undefined = decide(ctx);

          return selected === key;
        },
      };
      branches[key](new BranchBuilder<TForms, TCtx, {}>((node) => steps.push(node), gate));
    }

    return new StepperBuilder<TForms, TKinds, WithSteps<TCtx, BranchAdded<B>>>(this.appended(steps));
  }

  fork<A extends ForkArms<TForms, TCtx>>(
    select: (ctx: GateContext<TCtx>) => string,
    arms: A,
  ): TerminalForkBuilder<TForms, TCtx, ArmResult<A>> {
    const built = Object.entries(arms).map(([key, arm]) => [key, arm(new ForkArmBuilder<TForms, TCtx>())] as const);
    const merged = built.reduce<ChainState>((chain, [key, arm]) => {
      const gate: StepGate = { activeWhen: (ctx: GateContext<TCtx>) => select(ctx) === key };
      const steps = arm.steps.map((node) => guardedBy(gate, node));

      return {
        ...chain,
        forms: Object.entries(arm.forms).reduce(claimedForm, chain.forms),
        shared: new SharedState({ ...chain.shared.snapshot(), ...arm.shared.snapshot() }),
        steps: [...chain.steps, ...steps],
        stepNames: steps.reduce(claimedStep, chain.stepNames),
      };
    }, this.chain);
    const resolvers: Readonly<Record<string, ForkArm>> = Object.fromEntries(built);
    const definition: FlowDefinition = {
      forms: merged.forms,
      steps: merged.steps,
      shared: new SharedState(merged.shared.snapshot()),
      resolveResult: (ctx: GateContext<TCtx>) => resolvers[select(ctx)]?.resolve(ctx),
      controlTypes: merged.controlTypes,
      providers: merged.providers,
    };

    return { build: () => new Stepper<TForms, TCtx, ArmResult<A>>(definition) };
  }

  createStepper<N extends string, F2, TK2 extends string, TCtx2 extends RuntimeStepperContext, O extends FlowSlotCfg<TCtx>>(
    name: N,
    flow: O & LinearFlowStep<TKinds, TCtx, StepperBuilder<F2, TK2, TCtx2>>,
  ): StepperBuilder<TForms, TKinds, WithSteps<TCtx, StepEntry<N, StepsCommitted<TCtx2['steps']>, O>>> {
    const built = flow.build(new StepperBuilder<{}, TKinds, ChildContext<TCtx>>()).build();

    return new StepperBuilder<TForms, TKinds, WithSteps<TCtx, StepEntry<N, StepsCommitted<TCtx2['steps']>, O>>>(
      this.appended([flowStepNode({ name, flow: built, opts: flow })]),
    );
  }

  createRecurrentStepper<N extends string, C, F2, TCtx2 extends RingRuntimeContext<C>, O extends FlowSlotCfg<TCtx>>(
    name: N,
    ring: O & RecurrentFlowStep<C, TKinds, TCtx, RecurrentTerminal<F2, TCtx2, C>>,
  ): StepperBuilder<TForms, TKinds, WithSteps<TCtx, StepEntry<N, C, O>>> {
    const built = ring.build(new RecurrentStepperBuilder<{}, C, TKinds, RingContext<TCtx, C>>(ring)).build();

    return new StepperBuilder<TForms, TKinds, WithSteps<TCtx, StepEntry<N, C, O>>>(
      this.appended([flowStepNode({ name, flow: built, opts: ring })]),
    );
  }

  build(): Stepper<TForms, TCtx, never> {
    return new Stepper<TForms, TCtx, never>({
      forms: this.chain.forms,
      steps: this.chain.steps,
      shared: new SharedState(this.chain.shared.snapshot()),
      controlTypes: this.chain.controlTypes,
      providers: this.chain.providers,
    });
  }

  private appended(nodes: readonly SequenceNode[]): ChainState {
    return {
      ...this.chain,
      steps: [...this.chain.steps, ...nodes],
      stepNames: nodes.reduce(claimedStep, this.chain.stepNames),
    };
  }
}

/** The runtime shape of every context inside a ring over `C`. */
export type RingRuntimeContext<C> = StepperContext<
  SharedSignals,
  RuntimeStepperContext['steps'],
  RuntimeStepperContext['parent'],
  RecurrentSignals<C>
>;

/** A ring after `dock()`: only `build()` remains. */
export interface RecurrentTerminal<TForms, TCtx extends RuntimeStepperContext, C> {
  build(): RecurrentStepper<TForms, TCtx, C>;
}

/** A built ring: the runtime shape plus the authoring types it was built with. */
export class RecurrentStepper<TForms = {}, TCtx extends RuntimeStepperContext = RuntimeStepperContext, C = unknown>
  implements RecurrentFlowDefinition<C>
{
  readonly __forms?: TForms;

  readonly __context?: TCtx;

  readonly recurrent: true = true;

  readonly steps: readonly SequenceNode[];

  readonly forms: Readonly<Record<string, AnyFormProvider>>;

  readonly shared: SharedState;

  readonly controlTypes: ControlTypeMap;

  readonly providers: readonly Provider[];

  readonly dockAt: number;

  readonly state: () => C;

  readonly fold?: (state: C, pass: RuntimeStepperContext) => C;

  readonly dockReachable?: (state: C) => boolean;

  constructor(definition: RecurrentFlowDefinition<C>) {
    this.steps = definition.steps;
    this.forms = definition.forms;
    this.shared = definition.shared;
    this.controlTypes = definition.controlTypes;
    this.providers = definition.providers;
    this.dockAt = definition.dockAt;
    this.state = definition.state;
    this.fold = definition.fold;
    this.dockReachable = definition.dockReachable;
  }
}

interface RingState<C> extends ChainState {
  readonly ring: RingCfg<C>;

  fold?(state: C, pass: RuntimeStepperContext): C;
}

const passGate: StepGate = { activeWhen: (ctx) => ctx.flow?.passOpen() === true };

const dockGate: StepGate = { activeWhen: (ctx) => ctx.flow?.passOpen() !== true };

/** The root of a ring: pass steps, `fold`, `completeWhen`, then `dock` last. */
export class RecurrentStepperBuilder<
  TForms = {},
  C = unknown,
  TKinds extends string = ControlKind,
  TCtx extends RingRuntimeContext<C> = RingContext<RootContext, C>,
> {
  readonly __forms?: TForms;

  readonly __context?: TCtx;

  private readonly state: RingState<C>;

  private docked = false;

  constructor(ring: RingCfg<C> | RingState<C>) {
    this.state = 'steps' in ring ? ring : { ...EMPTY_CHAIN, ring };
  }

  provide(...providers: Provider[]): RecurrentStepperBuilder<TForms, C, TKinds, TCtx> {
    return new RecurrentStepperBuilder<TForms, C, TKinds, TCtx>({
      ...this.state,
      providers: [...this.state.providers, ...providers],
    });
  }

  withState<S extends Record<string, unknown>>(
    initial: S,
  ): RecurrentStepperBuilder<TForms, C, TKinds, WithShared<TCtx, S>> {
    return new RecurrentStepperBuilder<TForms, C, TKinds, WithShared<TCtx, S>>({
      ...this.state,
      shared: new SharedState({ ...this.state.shared.snapshot(), ...initial }),
    });
  }

  createForm<K extends string, F extends AnyFormProvider>(
    name: K,
    provider: F & PlacesCustomFields<FormUi<F>, FormPlaced<F>>,
  ): RecurrentStepperBuilder<TForms & Record<K, ConfigOf<F>>, C, TKinds, TCtx> {
    claimName(name, this.state.forms);

    return new RecurrentStepperBuilder<TForms & Record<K, ConfigOf<F>>, C, TKinds, TCtx>({
      ...this.state,
      forms: { ...this.state.forms, [name]: provider },
    });
  }

  addControlType<K extends string, Cmp extends object>(
    kind: K & UnregisteredKind<TKinds, K>,
    component: Type<Cmp> & ControlComponent<Cmp>,
  ): RecurrentStepperBuilder<TForms, C, TKinds | K, TCtx> {
    return new RecurrentStepperBuilder<TForms, C, TKinds | K, TCtx>({
      ...this.state,
      controlTypes: { ...this.state.controlTypes, [kind]: component },
    });
  }

  overrideControlType<K extends TKinds, Cmp extends object>(
    kind: K,
    component: Type<Cmp> & ControlComponent<Cmp>,
  ): RecurrentStepperBuilder<TForms, C, TKinds, TCtx> {
    return new RecurrentStepperBuilder<TForms, C, TKinds, TCtx>({
      ...this.state,
      controlTypes: { ...this.state.controlTypes, [kind]: component },
    });
  }

  createStep<
    N extends string = never,
    P = {},
    O extends StaticStepCfg<WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>, N> = StaticStepCfg<
      WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>,
      N
    >,
  >(
    build: StaticStepBuild<TForms, TCtx, P>,
    opts?: O & { readonly name?: N },
  ): RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>>;
  createStep<
    N extends string = never,
    P = {},
    O extends DynamicStepCfg<WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>, N> = DynamicStepCfg<
      WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>,
      N
    >,
  >(
    build: DynamicStepBuild<TForms, TCtx, P>,
    opts: O & { readonly name?: N },
  ): RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>>;
  createStep(build: DynamicStepBuild<TForms, TCtx, {}> & NotDynamic, opts?: StepCfg<WithSteps<TCtx, {}>, string>): never;
  createStep<N extends string = never, P = {}>(
    build: DynamicStepBuild<TForms, TCtx, P>,
    opts: StepCfg<WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>, N> = {},
  ): RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>> {
    return new RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>>(
      this.appended([stepNode({ pages: pagesOf(build, opts.pages === StepPages.OnEntry), opts, gate: passGate })]),
    );
  }

  branch<
    K extends string,
    B extends Record<K, (b: BranchBuilder<TForms, TCtx, {}>) => { __added?: unknown }>,
  >(
    select: BranchSelect<TCtx, K>,
    branches: B,
  ): RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, BranchAdded<B>>> {
    const steps: SequenceNode[] = [];
    const decide = decidedOnce(select);
    for (const key in branches) {
      const gate: StepGate = {
        activeWhen: (ctx: TCtx) => {
          if (!passGate.activeWhen(ctx)) return false;

          const selected: string | null | undefined = decide(ctx);

          return selected === key;
        },
      };
      branches[key](new BranchBuilder<TForms, TCtx, {}>((node) => steps.push(node), gate));
    }

    return new RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, BranchAdded<B>>>(this.appended(steps));
  }

  createStepper<N extends string, F2, TK2 extends string, TCtx2 extends RuntimeStepperContext, O extends FlowSlotCfg<TCtx>>(
    name: N,
    flow: O & LinearFlowStep<TKinds, TCtx, StepperBuilder<F2, TK2, TCtx2>>,
  ): RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, GatedEntry<N, StepsCommitted<TCtx2['steps']>>>> {
    const built = flow.build(new StepperBuilder<{}, TKinds, ChildContext<TCtx>>()).build();

    return new RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, GatedEntry<N, StepsCommitted<TCtx2['steps']>>>>(
      this.appended([guardedBy(passGate, flowStepNode({ name, flow: built, opts: flow }))]),
    );
  }

  createRecurrentStepper<N extends string, C2, F2, TCtx2 extends RingRuntimeContext<C2>, O extends FlowSlotCfg<TCtx>>(
    name: N,
    ring: O & RecurrentFlowStep<C2, TKinds, TCtx, RecurrentTerminal<F2, TCtx2, C2>>,
  ): RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, GatedEntry<N, C2>>> {
    const built = ring.build(new RecurrentStepperBuilder<{}, C2, TKinds, RingContext<TCtx, C2>>(ring)).build();

    return new RecurrentStepperBuilder<TForms, C, TKinds, WithSteps<TCtx, GatedEntry<N, C2>>>(
      this.appended([guardedBy(passGate, flowStepNode({ name, flow: built, opts: ring }))]),
    );
  }

  fold(fold: (state: C, pass: TCtx) => C): RecurrentStepperBuilder<TForms, C, TKinds, TCtx> {
    return new RecurrentStepperBuilder<TForms, C, TKinds, TCtx>({ ...this.state, fold });
  }

  dock<
    N extends string = never,
    P = {},
    O extends DockCfg<WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>, N> & { readonly pages?: StepPages.Once } = DockCfg<
      WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>,
      N
    > & { readonly pages?: StepPages.Once },
  >(build: StaticStepBuild<TForms, TCtx, P>, opts?: O & { readonly name?: N }): RecurrentTerminal<TForms, TCtx, C>;
  dock<
    N extends string = never,
    P = {},
    O extends DockCfg<WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>, N> & { readonly pages: StepPages.OnEntry } = DockCfg<
      WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>,
      N
    > & { readonly pages: StepPages.OnEntry },
  >(build: DynamicStepBuild<TForms, TCtx, P>, opts: O & { readonly name?: N }): RecurrentTerminal<TForms, TCtx, C>;
  dock(build: DynamicStepBuild<TForms, TCtx, {}> & NotDynamic, opts?: DockCfg<WithSteps<TCtx, {}>, string>): never;
  dock<N extends string = never, P = {}>(
    build: DynamicStepBuild<TForms, TCtx, P>,
    opts: DockCfg<WithSteps<TCtx, GatedEntry<N, StepInstance<TForms, P>>>, N> = {},
  ): RecurrentTerminal<TForms, TCtx, C> {
    if (this.docked) throw new Error('A recurrent flow has exactly one dock.');

    this.docked = true;
    const docked = this.appended([
      stepNode({ pages: pagesOf(build, opts.pages === StepPages.OnEntry), opts, gate: dockGate }),
    ]);
    const definition: RecurrentFlowDefinition<C> = {
      recurrent: true,
      steps: docked.steps,
      forms: docked.forms,
      shared: new SharedState(docked.shared.snapshot()),
      controlTypes: docked.controlTypes,
      providers: docked.providers,
      dockAt: this.state.steps.length,
      state: this.state.ring.state,
      fold: this.state.fold,
      dockReachable: this.state.ring.dockReachable,
    };

    return { build: () => new RecurrentStepper<TForms, TCtx, C>(definition) };
  }

  private appended(nodes: readonly SequenceNode[]): RingState<C> {
    return {
      ...this.state,
      steps: [...this.state.steps, ...nodes],
      stepNames: nodes.reduce(claimedStep, this.state.stepNames),
    };
  }
}
