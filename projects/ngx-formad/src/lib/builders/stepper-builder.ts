import { Provider, Type } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { FormConfig } from '../form-config/form-config';
import { ControlTypeMap } from '../provide';
import { SharedState } from '../sync/shared-state';
import { ContentBuild, buildContent } from './content';
import { ComponentCfg, Reactive, toBindings } from './dynamic-component';
import {
  FlowDefinition,
  FlowStepNode,
  isRecurrent,
  RecurrentFlowDefinition,
  RuntimeFlow,
  SequenceNode,
} from './flow';
import { FlowPort, FlowView } from './flow-port';
import {
  DynamicPages,
  LayoutNode,
  PageNode,
  PageOptions,
  SequenceNodeKind,
} from './nodes';
import {
  FieldRef,
  FieldRefs,
  FormEffects,
  recordEffects,
  recordLinks,
  selectedKey,
  SharedLink,
} from './shared-link';
import {
  AnyFormProvider,
  DeferTrigger,
  FormKeys,
  FormModel,
  FormProvider,
  GateContext,
  RuntimeFormSeed,
  RuntimeResultResolver,
  RuntimeStepCondition,
  RuntimeStepContext,
  StepCondition,
  StepContext,
  StepInstance,
} from './step-context';
import { FormState } from '../renderer/instantiate-form';

/** The control kinds the suite ships out of the box — the starting set a stepper's
 *  `addControlType` forbids re-adding (use `overrideControlType` to replace one). */
export type BuiltInControlKind =
  | 'text'
  | 'email'
  | 'password'
  | 'tel'
  | 'url'
  | 'textarea'
  | 'number'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'date'
  | 'file';

// One typed chain describes the whole wizard. The generics it threads:
//   TForms  — the pool of TEMPLATES (`createForm`/`createControl`), read by `addForm`.
//   TShared — the flow's global shared state (`withState`, `bind`).
//   TSteps  — what NAMED predecessors on this level expose: their live instances by
//             pool name. A step's build callback infers what it PLACED, and
//             `createStep({ name })` adds `Record<name, StepInstance<placed>>` — `|
//             undefined` when the step is gated (`when`, a branch, a pass), since a
//             successor may find it skipped. This is the LOCAL state channel.
//   TParent — the enclosing flow's context, for a nested flow (`ctx.parent`); each
//             nesting level is its own namespace of step names.
// The pool holds templates: the same config placed in two steps is two instances.

type Rec = Record<string, unknown>;

// The erased pool entry. We don't bound the builder type params by this: a
// concrete `FormConfig<Account>` is not assignable to `FormConfig<Record<…>>`
// (the `schema` field makes it invariant in the model), so a bound would reject
// the very forms the chain creates. The precise types live on the per-call
// generics instead; this alias is only the erased shape the runtime walks.
type AnyForm = FormConfig<Rec>;

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never;

// ── Step entries ──

/** What a named step adds to `TSteps`: nothing when unnamed; its instances when
 *  named — `| undefined` when its options carry a `when`. */
export type StepEntry<N extends string, Inst, O> = [N] extends [never]
  ? {}
  : Record<N, O extends { readonly when: unknown } ? Inst | undefined : Inst>;

/** A step that is always gated (branch, pass): present or skipped. */
export type GatedEntry<N extends string, Inst> = [N] extends [never]
  ? {}
  : Record<N, Inst | undefined>;

/** The values behind one step's instances — what a linear sub-flow commits. */
export type StepValues<Inst> = {
  readonly [F in keyof NonNullable<Inst>]: NonNullable<Inst>[F] extends FormState<infer M>
    ? M
    : NonNullable<Inst>[F];
};

/** A linear flow's egress — the root's `committed()` / `stepCommitted`, a nested
 *  flow's value in its parent's context: the named steps' values, each possibly
 *  absent (not reached yet, or gated off). */
export type StepsCommitted<TSteps> = { readonly [K in keyof TSteps]?: StepValues<TSteps[K]> };

/** The typed shape of a built stepper's egress — for a host narrowing the erased
 *  `stepCommitted` record ONCE, at the boundary, instead of per field. */
export type CommittedOf<S> =
  S extends Stepper<infer _F, infer _S, infer _R, infer TSteps> ? StepsCommitted<TSteps> : never;

// ── Placement options ──

/** Placement options for a content block: the slot's layout classes and the gate
 *  that hides the whole block. Per-tag classes and gates live on the tags. */
export interface ContentCfg {
  readonly layout?: string;
  readonly visibleWhen?: () => boolean;
}

/** Placement options for a pooled form. */
export interface FormCfg<M, TShared, TSteps, TParent> {
  readonly submitLabel?: string;
  readonly visibleWhen?: () => boolean;
  /** GLOBAL channel: two-way sync of model fields with shared-state keys. */
  readonly bind?: (link: SharedLink<M, TShared>) => void;
  /** Wire a field's control outputs to patch the form model — e.g. a VAT-ID field
   *  whose `resolved` output fills in company name/address. */
  readonly effects?: (e: FormEffects<M>) => void;
  /** LOCAL channel: starting values for THIS instance, read from the entry context
   *  (a predecessor's live instance) when the step materializes. A rejected and
   *  re-entered step reads it again. */
  readonly initial?: (ctx: StepContext<TShared, TSteps, TParent>) => Partial<M>;
}

/** Builds the contents of one page. `P` accumulates what was placed. */
export class PageBuilder<TForms, TShared extends Rec, TSteps, TParent, P = {}> {
  /** Phantom — carries what this page placed, for the step's inference. */
  readonly __placed?: P;

  private readonly children: LayoutNode[] = [];

  /**
   * A content block - prose, a list, a link, a note - authored with the tag
   * builder, in its own layout slot. The markup is data like everything else here:
   * text and attributes may be getters, and `visibleWhen` gates the block, so the
   * author never writes a template or an `@if`. With no build callback it is the
   * bare slot it has always been - a spacer.
   */
  addContent(build: ContentBuild, cfg?: ContentCfg): this;
  addContent(cfg?: ContentCfg, build?: ContentBuild): this;
  addContent(first?: ContentCfg | ContentBuild, second?: ContentCfg | ContentBuild): this {
    const cfg = (typeof first === 'function' ? second : first) as ContentCfg | undefined;
    const build = (typeof first === 'function' ? first : second) as ContentBuild | undefined;
    this.children.push({
      kind: 'content',
      layout: cfg?.layout,
      visibleWhen: cfg?.visibleWhen,
      children: build ? buildContent(build) : [],
    });

    return this;
  }

  /** A dynamic component, its inputs/outputs typed to the component itself. */
  addComponent<C>(component: Type<C>, cfg: ComponentCfg<C>): this {
    this.children.push({
      kind: 'component',
      component: component as Type<unknown>,
      bindings: toBindings(cfg),
      visibleWhen: cfg.visibleWhen,
      layout: cfg.layout,
    });

    return this;
  }

  /** A nested layout group with its own classes; what it places counts as placed. */
  insertRow<P2>(
    layout: string,
    build: (
      row: PageBuilder<TForms, TShared, TSteps, TParent, {}>,
    ) => PageBuilder<TForms, TShared, TSteps, TParent, P2>,
  ): PageBuilder<TForms, TShared, TSteps, TParent, P & P2> {
    const row = new PageBuilder<TForms, TShared, TSteps, TParent, {}>();
    build(row);
    this.children.push({ kind: 'row', layout, children: row.drain() });

    return this as unknown as PageBuilder<TForms, TShared, TSteps, TParent, P & P2>;
  }

  /** A form from the pool, selected by callback — instantiated by THIS step. */
  // `K` is inferred from the selected `FieldRef`'s `__key`, not from the indexed
  // return type `FieldRefs<TForms>[K]` — TS cannot infer a type param out of an
  // indexed access in return position and silently widens it to `keyof TForms`,
  // which would type `bind` against the union of every pooled model. Reading the
  // key off the ref pins `K` to the one form selected, so `FormModel` is exact.
  addForm<K extends FormKeys<TForms> & string>(
    select: (forms: FieldRefs<TForms>) => FieldRef<K, unknown>,
    opts: FormCfg<FormModel<TForms[K]>, TShared, TSteps, TParent> = {},
  ): PageBuilder<TForms, TShared, TSteps, TParent, P & Record<K, true>> {
    const name = selectedKey<TForms>(
      select as (f: FieldRefs<TForms>) => FieldRef<keyof TForms, unknown>,
    );
    this.children.push({
      kind: 'form',
      name,
      submitLabel: opts.submitLabel,
      visibleWhen: opts.visibleWhen,
      links: opts.bind ? recordLinks(opts.bind) : [],
      effects: opts.effects ? recordEffects(opts.effects) : [],
      initial: opts.initial as unknown as RuntimeFormSeed | undefined,
    });

    return this as unknown as PageBuilder<TForms, TShared, TSteps, TParent, P & Record<K, true>>;
  }

  /** Hands the accumulated nodes to the parent; internal to the builders. */
  drain(): LayoutNode[] {
    return this.children;
  }
}

/** Builds one step out of one or more pages. `P` accumulates what they placed. */
export class StepBuilder<TForms, TShared extends Rec, TSteps, TParent, P = {}> {
  /** Phantom — what this step placed, inferred by `createStep`. */
  readonly __placed?: P;

  private readonly pages: PageNode[] = [];

  createPage<P2>(
    meta: { options: PageOptions },
    build: (
      page: PageBuilder<TForms, TShared, TSteps, TParent, {}>,
    ) => PageBuilder<TForms, TShared, TSteps, TParent, P2>,
  ): StepBuilder<TForms, TShared, TSteps, TParent, P & P2> {
    const page = new PageBuilder<TForms, TShared, TSteps, TParent, {}>();
    build(page);
    this.pages.push({ options: meta.options, children: page.drain() });

    return this as unknown as StepBuilder<TForms, TShared, TSteps, TParent, P & P2>;
  }

  /** Hands the accumulated pages to the parent; internal to the builders. */
  drainPages(): readonly PageNode[] {
    return this.pages;
  }
}

/** One step's build callback. Its RETURN carries what the step placed (so return
 *  the builder you chained). Declaring the SECOND parameter makes the step
 *  DYNAMIC: the callback then runs when the step is reached, with the live
 *  context, so the step's structure can follow the user's earlier answers. It
 *  must be pure: a re-entry after a discard runs it again. A one-parameter
 *  callback builds plain data, once. */
export type StepBuild<TForms, TShared extends Rec, TSteps, TParent, P> = (
  step: StepBuilder<TForms, TShared, TSteps, TParent, {}>,
  ctx: StepContext<TShared, TSteps, TParent>,
) => StepBuilder<TForms, TShared, TSteps, TParent, P>;

/** Per-step options. `name` is the key successors read this step's instances
 *  under; `when` gates it (and marks its entry `| undefined` for successors). */
export interface StepOptions<TShared, TSteps, TParent, N extends string = never> {
  readonly name?: N;
  /** The step's short name for a chrome's progress rail - reactive. */
  readonly label?: Reactive<string>;
  /** Drops the step from the sequence when it returns false; reactive. */
  readonly when?: StepCondition<TShared, TSteps, TParent>;
  /** Marks the step skippable — the shell shows a Skip that bypasses the gate. */
  readonly optional?: boolean;
  /** Renders the step body inside an `@defer` block with this trigger. */
  readonly defer?: DeferTrigger;
  /** An extra completion guard, ANDed with the form fold so a step driven by
   *  dynamic components (which contribute no fields to fold) can still gate Next
   *  on its own state. */
  readonly completeWhen?: StepCondition<TShared, TSteps, TParent>;
  /** Shown in the chrome's blocker list when `completeWhen` is what holds Next
   *  back. Without it the user gets a generic "not complete yet". */
  readonly incompleteMessage?: string;
}

/** A branch selector: the key of the branch to take, or null/undefined while the
 *  answer it derives from has not been given yet — then NO branch's steps are in
 *  the sequence, instead of some made-up default. The keys come from the type. */
export type BranchSelect<TShared, TSteps, TParent, K extends string> = (
  ctx: GateContext<TShared, TSteps, TParent>,
) => K | null | undefined;

// ── Erasure for the internal plumbing: the single place typed callbacks become
// the runtime shapes the nodes store. `never`-typed parameters accept any typed
// callback (contravariance) and forbid calling them without the cast below.
type ErasedStepBuild = (step: never, ctx: never) => unknown;

type ErasedStepOptions = StepOptions<Rec, {}, unknown, string>;

// How a branch hands a step back to the parent builder, carrying the branch guard.
type PushStep = (build: ErasedStepBuild, opts: ErasedStepOptions, guard: RuntimeStepCondition) => void;

/** What the arms of a `branch` record add together: every branch's entries,
 *  all gated. */
export type BranchAdded<B> = UnionToIntersection<
  { [K in keyof B]: B[K] extends (b: never) => { __added?: infer A } ? A : never }[keyof B]
>;

/** Authors the steps of one branch. Every step it adds is guarded by the branch's
 *  condition, so it only runs when that branch is selected — and appears to
 *  successors as `| undefined`. Later branch steps see earlier ones. */
export class BranchBuilder<TForms, TShared extends Rec, TSteps, TParent, TAdded = {}> {
  /** Phantom — what this branch added, merged by `branch`. */
  readonly __added?: TAdded;

  constructor(
    private readonly push: PushStep,
    private readonly guard: RuntimeStepCondition,
  ) {}

  /** A step in this branch — same shape as `createStep`, guarded by the branch. */
  step<N extends string = never, P = {}>(
    build: StepBuild<TForms, TShared, TSteps & TAdded, TParent, P>,
    opts: StepOptions<TShared, TSteps & TAdded, TParent, N> = {},
  ): BranchBuilder<TForms, TShared, TSteps, TParent, TAdded & GatedEntry<N, StepInstance<TForms, P>>> {
    this.push(build as unknown as ErasedStepBuild, opts as unknown as ErasedStepOptions, this.guard);

    return this as unknown as BranchBuilder<
      TForms,
      TShared,
      TSteps,
      TParent,
      TAdded & GatedEntry<N, StepInstance<TForms, P>>
    >;
  }

  /** A nested split: each inner step is guarded by *this* branch AND the inner key. */
  branch<
    K extends string,
    B extends Record<
      K,
      (b: BranchBuilder<TForms, TShared, TSteps & TAdded, TParent, {}>) => { __added?: unknown }
    >,
  >(
    select: BranchSelect<TShared, TSteps & TAdded, TParent, K>,
    branches: B,
  ): BranchBuilder<TForms, TShared, TSteps, TParent, TAdded & BranchAdded<B>> {
    const erased = select as unknown as (ctx: RuntimeStepContext) => string | null | undefined;
    for (const key of Object.keys(branches) as K[]) {
      const nested: RuntimeStepCondition = (ctx) => this.guard(ctx) && erased(ctx) === key;
      branches[key](new BranchBuilder<TForms, TShared, TSteps & TAdded, TParent, {}>(this.push, nested));
    }

    return this as unknown as BranchBuilder<TForms, TShared, TSteps, TParent, TAdded & BranchAdded<B>>;
  }
}

// Every pool name — form, control — and every step name must be unique within its
// flow: instances, placements and `ctx.steps` are all keyed by them. A duplicate
// is an authoring bug, refused loudly at build time. (A runtime check, not a
// conditional type on the name: the type trick cannot be proven over a generic
// pool, which is exactly what a composed wizard fragment works with.)
function claimName(name: string, pools: readonly Record<string, unknown>[]): void {
  for (const pool of pools) {
    if (name in pool) throw new Error(`The name '${name}' is already taken.`);
  }
}

// ANDs an optional branch guard with a step's own `when`; either, both, or neither.
function combineConditions(
  guard: RuntimeStepCondition | undefined,
  own: RuntimeStepCondition | undefined,
): RuntimeStepCondition | undefined {
  if (guard && own) return (ctx) => guard(ctx) && own(ctx);

  return guard ?? own;
}

// Builds one step node into `target`, combining an optional guard with the step's
// own `when`. The single place a step is created — used by createStep, branch, and
// fork arms, so the condition/erasure logic lives once.
function appendStep(
  target: SequenceNode[],
  build: ErasedStepBuild,
  opts: ErasedStepOptions,
  guard?: RuntimeStepCondition,
): void {
  target.push({
    kind: SequenceNodeKind.Step,
    name: opts.name,
    pages: pagesOf(build),
    label: opts.label,
    when: combineConditions(guard, opts.when as unknown as RuntimeStepCondition | undefined),
    optional: opts.optional,
    defer: opts.defer,
    completeWhen: opts.completeWhen as unknown as RuntimeStepCondition | undefined,
    incompleteMessage: opts.incompleteMessage,
  });
}

// The arity of the callback decides when it runs: a second declared parameter is
// the author asking for the live context, so the pages become a pure factory run
// on entry; without it the pages are plain data, built right here, once. (A
// default or rest parameter does not count towards `length` — the context must be
// a plainly declared second parameter.)
function pagesOf(build: ErasedStepBuild): readonly PageNode[] | DynamicPages {
  const run = build as unknown as (
    step: StepBuilder<Rec, Rec, {}, unknown, {}>,
    ctx: RuntimeStepContext | undefined,
  ) => unknown;

  if (build.length >= 2) {
    return (ctx) => {
      const step = new StepBuilder<Rec, Rec, {}, unknown, {}>();
      run(step, ctx);
      return step.drainPages();
    };
  }

  const step = new StepBuilder<Rec, Rec, {}, unknown, {}>();
  run(step, undefined);
  return step.drainPages();
}

// ── Forking ──
// A fork diverges into arms that do NOT rejoin, each producing its own typed
// result. Branch = "vary the middle, one outcome"; fork = "commit to one sub-flow,
// its own outcome". An arm authors its own state/forms/steps, then declares a
// `result`; `fork` unions the arms' results into the stepper's `TResult` and
// returns a terminal (only `build()`), so nothing can follow a fork.

/** One fork arm's accumulated definition, handed back to `fork`. */
interface ForkArmDef {
  readonly forms: Record<string, AnyFormProvider>;
  readonly sharedInit: Rec;
  readonly steps: readonly SequenceNode[];
  readonly resolve: RuntimeResultResolver;
}

/** The terminal of one fork arm. Carries the arm's result type `R` (for `fork` to
 *  infer the union) plus, internally, its definition. Produced by `arm.result(...)`. */
export interface ForkArm<R> {
  /** Phantom — present only so `fork` can infer each arm's result type. */
  readonly __result?: R;
  /** @internal the arm's accumulated definition. */
  readonly _def: ForkArmDef;
}

/** Authors one fork arm: its own state, forms, steps (and nested branches), ending
 *  in a required `result(...)`. Everything here is local to the arm; its steps are
 *  gated by the arm's selection, so they reach the resolver as `| undefined`. */
export class ForkArmBuilder<TForms, TShared extends Rec, TSteps, TParent, TAdded = {}> {
  private readonly forms: Record<string, AnyFormProvider> = {};
  private readonly sharedInit: Rec = {};
  private readonly steps: SequenceNode[] = [];

  /** Arm-local shared state, merged into the wizard's store. */
  withState<S extends Rec>(initial: S): ForkArmBuilder<TForms, TShared & S, TSteps, TParent, TAdded> {
    Object.assign(this.sharedInit, initial);
    return this as unknown as ForkArmBuilder<TForms, TShared & S, TSteps, TParent, TAdded>;
  }

  /** Arm-local form, eager or lazy; narrows the arm's pool. */
  createForm<K extends string, M extends Rec>(
    name: K,
    provider: FormProvider<M>,
  ): ForkArmBuilder<TForms & Record<K, FormConfig<M>>, TShared, TSteps, TParent, TAdded> {
    claimName(name, [this.forms]);
    this.forms[name] = provider as unknown as AnyFormProvider;
    return this as unknown as ForkArmBuilder<
      TForms & Record<K, FormConfig<M>>,
      TShared,
      TSteps,
      TParent,
      TAdded
    >;
  }

  /** A step in this arm — same shape as `createStep`, gated by the arm. */
  createStep<N extends string = never, P = {}>(
    build: StepBuild<TForms, TShared, TSteps & TAdded, TParent, P>,
    opts: StepOptions<TShared, TSteps & TAdded, TParent, N> = {},
  ): ForkArmBuilder<TForms, TShared, TSteps, TParent, TAdded & GatedEntry<N, StepInstance<TForms, P>>> {
    appendStep(this.steps, build as unknown as ErasedStepBuild, opts as unknown as ErasedStepOptions);
    return this as unknown as ForkArmBuilder<
      TForms,
      TShared,
      TSteps,
      TParent,
      TAdded & GatedEntry<N, StepInstance<TForms, P>>
    >;
  }

  /** A branch within this arm — sugar over guarded steps, as elsewhere. */
  branch<
    K extends string,
    B extends Record<
      K,
      (b: BranchBuilder<TForms, TShared, TSteps & TAdded, TParent, {}>) => { __added?: unknown }
    >,
  >(
    select: BranchSelect<TShared, TSteps & TAdded, TParent, K>,
    branches: B,
  ): ForkArmBuilder<TForms, TShared, TSteps, TParent, TAdded & BranchAdded<B>> {
    const erased = select as unknown as (ctx: RuntimeStepContext) => string | null | undefined;
    for (const key of Object.keys(branches) as K[]) {
      const guard: RuntimeStepCondition = (ctx) => erased(ctx) === key;
      branches[key](
        new BranchBuilder<TForms, TShared, TSteps & TAdded, TParent, {}>(
          (b, o, g) => appendStep(this.steps, b, o, g),
          guard,
        ),
      );
    }

    return this as unknown as ForkArmBuilder<TForms, TShared, TSteps, TParent, TAdded & BranchAdded<B>>;
  }

  /** Declares this arm's typed result and terminates the arm. */
  result<R>(resolve: (ctx: GateContext<TShared, TSteps & TAdded, TParent>) => R): ForkArm<R> {
    return {
      _def: {
        forms: this.forms,
        sharedInit: this.sharedInit,
        steps: this.steps,
        resolve: resolve as unknown as RuntimeResultResolver,
      },
    } as ForkArm<R>;
  }
}

/** A forked chain — terminal. Nothing can follow a fork; only `build()` remains. */
export interface TerminalForkBuilder<TForms, TShared extends Rec, TResult, TSteps> {
  build(): Stepper<TForms, TShared, TResult, TSteps>;
}

/** The shape of a `fork`'s arms map: each key authors an arm ending in a result. */
type ForkArms<TForms, TShared extends Rec, TSteps, TParent> = Record<
  string,
  (arm: ForkArmBuilder<TForms, TShared, TSteps, TParent>) => ForkArm<unknown>
>;

/** The union of every arm's result type — the stepper's discriminated `TResult`.
 *  Inferring per arm (not a single shared `R`) is what lets the arms differ. */
type ArmResult<A> = {
  [P in keyof A]: A[P] extends (arm: never) => ForkArm<infer R> ? R : never;
}[keyof A];

/** A built wizard: its typed form pool, its step tree, its shared store, its
 *  declared providers and — if it forks — a resolver for the active arm's
 *  discriminated result. `TResult` is `never` unless the chain forks. `TSteps` is
 *  the accumulated record of named steps — see {@link CommittedOf}. */
export class Stepper<TForms, TShared extends Rec, TResult = never, TSteps = {}> {
  /** Phantom — carries the named-step record for {@link CommittedOf}. */
  readonly __steps?: TSteps;

  constructor(
    readonly forms: TForms,
    readonly steps: readonly SequenceNode[],
    readonly shared: SharedState<TShared>,
    /** Set by `fork`: maps the runtime context to the active arm's result. */
    readonly resolveResult?: RuntimeResultResolver,
    /** Wizard-scoped control kinds (from `addControlType`/`overrideControlType`),
     *  layered over the global adapter by the shell for this stepper's subtree. */
    readonly controlTypes: ControlTypeMap = {},
    /** The flow's declared dependencies — see `StepperBuilder.provide`. */
    readonly providers: readonly Provider[] = [],
  ) {}
}

/** A stepper with its precise pool/shared/result types erased, as the runtime sees it. */
export type RuntimeStepper = Stepper<Record<string, AnyForm>, Rec, unknown>;

// The chain is typed for authoring; the runtime walks the pool by string name
// and the shared store by string key, so it works on an erased view. `SharedState`
// is invariant in its state type, so this widening needs one explicit step —
// the single, named place that erasure happens, like `asRenderable` for a form.
export function asStepper<TForms, TShared extends Rec, TResult = never, TSteps = {}>(
  stepper: Stepper<TForms, TShared, TResult, TSteps>,
): RuntimeStepper {
  return stepper as unknown as RuntimeStepper;
}

/** Options for a nested flow step — the parent-side slot, not the flow itself. */
export interface FlowStepOptions<TShared, TSteps, TParent> {
  readonly label?: Reactive<string>;
  readonly when?: StepCondition<TShared, TSteps, TParent>;
  readonly defer?: DeferTrigger;
}

/** Declaration of a nested recurrent flow: its collection seed and, optionally,
 *  a non-default "the dock is reachable" predicate. */
export interface RecurrentCfg<C, TShared, TSteps, TParent>
  extends FlowStepOptions<TShared, TSteps, TParent> {
  /** A fresh collection — the accumulator's starting value; its return type fixes
   *  the flow's collection type. */
  readonly collection: () => C;
  /** Defaults to `length > 0` for arrays, `!= null` otherwise. */
  readonly hasAny?: (collection: C) => boolean;
}

/** The root of the chain. Each method narrows or appends; `build()` freezes it.
 *  `TKinds` tracks the registered control kinds (seeded with the built-ins) so
 *  `addControlType` rejects a name that already exists. */
export class StepperBuilder<
  TForms = {},
  TShared extends Rec = {},
  TKinds extends string = BuiltInControlKind,
  TSteps = {},
  TParent = undefined,
> {
  /** Phantom — the accumulated step entries, for a nested builder's inference. */
  readonly __steps?: TSteps;

  // The pool stores configs or lazy loaders; the runtime resolves loaders on reach.
  private readonly forms: Record<string, AnyFormProvider> = {};
  private sharedInit: Rec = {};
  private readonly steps: SequenceNode[] = [];
  private resultResolver?: RuntimeResultResolver;
  private readonly controlTypes: ControlTypeMap = {};
  private readonly providers: Provider[] = [];
  // Step names (leaf steps and nested flows alike) — one namespace per level.
  private readonly stepNames: Record<string, true> = {};

  /** Registers a NEW control kind for this wizard (resolved before the global
   *  adapter and the built-ins). Re-adding an existing kind is a compile error —
   *  use {@link overrideControlType} to replace one. */
  addControlType<K extends string>(
    kind: K extends TKinds ? never : K,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    component: Type<FormValueControl<any>>,
  ): StepperBuilder<TForms, TShared, TKinds | K, TSteps, TParent> {
    this.controlTypes[kind as string] = component;
    return this as unknown as StepperBuilder<TForms, TShared, TKinds | K, TSteps, TParent>;
  }

  /** Replaces an existing control kind (a built-in, or one added earlier) for this
   *  wizard. The kind must already exist — to introduce one use {@link addControlType}. */
  overrideControlType<K extends TKinds>(
    kind: K,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    component: Type<FormValueControl<any>>,
  ): this {
    this.controlTypes[kind] = component;
    return this;
  }

  /** Declares the flow's dependencies. They become its own injection environment
   *  (inheriting the parent flow's, up to the application's), so step components
   *  and author callbacks (`when`, `completeWhen`, dynamic steps, `fold`)
   *  `inject(...)` them directly — the router-guard idiom. Note: providing a
   *  class token creates a NEW instance scoped to the flow; to hand the flow an
   *  existing instance, use `{ provide: Token, useValue: instance }`. */
  provide(...providers: Provider[]): this {
    this.providers.push(...providers);
    return this;
  }

  /** Declares the flow's GLOBAL shared state; narrows `TShared` by intersection,
   *  so a nested flow's own state layers over the parent shape it already sees. */
  withState<S extends Rec>(initial: S): StepperBuilder<TForms, TShared & S, TKinds, TSteps, TParent> {
    // A copy: `fork` merges each arm's state into this object, and a caller who
    // passed a shared constant would otherwise find their own literal carrying
    // keys from a wizard built somewhere else.
    this.sharedInit = { ...this.sharedInit, ...initial };
    return this as unknown as StepperBuilder<TForms, TShared & S, TKinds, TSteps, TParent>;
  }

  /** Registers a form TEMPLATE in the pool under `name`; narrows `TForms`. The
   *  provider may be the config itself or a loader (`() => Promise<FormConfig<M>>`)
   *  for a form whose definition is fetched only when its step is reached. Every
   *  step that places it (`addForm`) gets its own instance. */
  createForm<K extends string, M extends Rec>(
    name: K,
    provider: FormProvider<M>,
  ): StepperBuilder<TForms & Record<K, FormConfig<M>>, TShared, TKinds, TSteps, TParent> {
    claimName(name, [this.forms]);
    this.forms[name] = provider as unknown as AnyFormProvider;
    return this as unknown as StepperBuilder<
      TForms & Record<K, FormConfig<M>>,
      TShared,
      TKinds,
      TSteps,
      TParent
    >;
  }

  /** Appends a step. What the callback places becomes the step's instances; with
   *  `opts.name` they reach every later step as `ctx.steps.<name>` (typed, `|
   *  undefined` when the step has a `when`). */
  createStep<
    N extends string = never,
    P = {},
    O extends StepOptions<TShared, TSteps, TParent, N> = StepOptions<TShared, TSteps, TParent, N>,
  >(
    build: StepBuild<TForms, TShared, TSteps, TParent, P>,
    opts?: O & { readonly name?: N },
  ): StepperBuilder<TForms, TShared, TKinds, TSteps & StepEntry<N, StepInstance<TForms, P>, O>, TParent> {
    this.pushStep(build as unknown as ErasedStepBuild, (opts ?? {}) as unknown as ErasedStepOptions);
    return this as unknown as StepperBuilder<
      TForms,
      TShared,
      TKinds,
      TSteps & StepEntry<N, StepInstance<TForms, P>, O>,
      TParent
    >;
  }

  /**
   * Splits the flow into branches by a runtime selector. Each branch's steps are
   * appended guarded by `select(ctx) === key`, so at run time only the chosen
   * branch's steps survive the effective-sequence filter — and any steps added
   * after the branch are ungated, so the branches **rejoin automatically**. Every
   * branch step reaches successors as `| undefined`.
   */
  branch<
    K extends string,
    B extends Record<
      K,
      (b: BranchBuilder<TForms, TShared, TSteps, TParent, {}>) => { __added?: unknown }
    >,
  >(
    select: BranchSelect<TShared, TSteps, TParent, K>,
    branches: B,
  ): StepperBuilder<TForms, TShared, TKinds, TSteps & BranchAdded<B>, TParent> {
    const erased = select as unknown as (ctx: RuntimeStepContext) => string | null | undefined;
    for (const key of Object.keys(branches) as K[]) {
      const guard: RuntimeStepCondition = (ctx) => erased(ctx) === key;
      branches[key](
        new BranchBuilder<TForms, TShared, TSteps, TParent, {}>(
          (build, opts, g) => this.pushStep(build, opts, g),
          guard,
        ),
      );
    }

    return this as unknown as StepperBuilder<TForms, TShared, TKinds, TSteps & BranchAdded<B>, TParent>;
  }

  /**
   * Forks the flow: a selector commits the wizard to one arm, and each arm is its
   * own sub-flow with its own state, forms, steps, and a typed `result`. Unlike
   * `branch`, arms do **not** rejoin — `fork` returns a terminal builder (only
   * `build()`), and the stepper's result type becomes the union of the arms'
   * results. Arm steps compile to guarded steps (so navigation reuses the engine),
   * and the arms' results compile to a single resolver picking the active one.
   */
  fork<A extends ForkArms<TForms, TShared, TSteps, TParent>>(
    // The selector returns a branch key; a value with no matching arm means "no arm
    // chosen yet" (e.g. before the user decides) — no arm steps, no result.
    select: (ctx: GateContext<TShared, TSteps, TParent>) => string,
    arms: A,
  ): TerminalForkBuilder<TForms, TShared, ArmResult<A>, TSteps> {
    const erased = select as unknown as (ctx: RuntimeStepContext) => string;
    const resolvers: Record<string, RuntimeResultResolver> = {};
    for (const key of Object.keys(arms) as (keyof A & string)[]) {
      const def = arms[key](new ForkArmBuilder<TForms, TShared, TSteps, TParent>())._def;
      Object.assign(this.forms, def.forms);
      Object.assign(this.sharedInit, def.sharedInit);
      const guard: RuntimeStepCondition = (ctx) => erased(ctx) === key;
      for (const node of def.steps) {
        this.steps.push({ ...node, when: combineConditions(guard, node.when) });
      }
      resolvers[key] = def.resolve;
    }
    this.resultResolver = (ctx) => resolvers[erased(ctx)]?.(ctx);

    return this as unknown as TerminalForkBuilder<TForms, TShared, ArmResult<A>, TSteps>;
  }

  /**
   * A nested linear flow occupying ONE slot of this sequence, with its own pool,
   * shared state and step namespace; it reaches this level through `ctx.parent`.
   * Its committed record reaches successors as `ctx.steps.<name>`.
   */
  createStepper<
    N extends string,
    F2,
    S2 extends Rec,
    TK2 extends string,
    TS2,
    O extends FlowStepOptions<TShared, TSteps, TParent>,
  >(
    name: N,
    opts: O,
    build: (
      sub: StepperBuilder<{}, TShared, TKinds, {}, StepContext<TShared, TSteps, TParent>>,
    ) => StepperBuilder<F2, S2, TK2, TS2, StepContext<TShared, TSteps, TParent>>,
  ): StepperBuilder<
    TForms,
    TShared,
    TKinds,
    TSteps & StepEntry<N, StepsCommitted<TS2>, O>,
    TParent
  > {
    claimName(name, [this.stepNames]);
    this.stepNames[name] = true;
    const sub = new StepperBuilder() as StepperBuilder<
      {},
      TShared,
      TKinds,
      {},
      StepContext<TShared, TSteps, TParent>
    >;
    const chained = build(sub);
    this.steps.push(flowStepNode(name, opts, erasedFlow(chained.build())));

    return this as unknown as StepperBuilder<
      TForms,
      TShared,
      TKinds,
      TSteps & StepEntry<N, StepsCommitted<TS2>, O>,
      TParent
    >;
  }

  /**
   * A nested recurrent flow — a ring of pass steps around a dock — occupying ONE
   * slot of this sequence. Its collection accumulates by the flow's own pure
   * `fold` and reaches successors as `ctx.steps.<name>`; `view` hands components
   * authored inside the flow a read on that collection (`all()` / `others()`).
   */
  createRecurrentStepper<N extends string, C, O extends FlowStepOptions<TShared, TSteps, TParent>>(
    name: N,
    cfg: RecurrentCfg<C, TShared, TSteps, TParent> & O,
    build: (
      loop: RecurrentStepperBuilder<{}, TShared, C, TKinds, {}, StepContext<TShared, TSteps, TParent>>,
      view: FlowView<C>,
    ) => unknown,
  ): StepperBuilder<TForms, TShared, TKinds, TSteps & StepEntry<N, C, O>, TParent> {
    claimName(name, [this.stepNames]);
    this.stepNames[name] = true;
    const loop = new RecurrentStepperBuilder<
      {},
      TShared,
      C,
      TKinds,
      {},
      StepContext<TShared, TSteps, TParent>
    >(cfg.collection, cfg.hasAny);
    build(loop, loop.view);
    // The single place this flow's collection type is erased for the node tree.
    const flow = loop._drain() as RecurrentFlowDefinition;
    this.steps.push(flowStepNode(name, cfg, flow));

    return this as unknown as StepperBuilder<
      TForms,
      TShared,
      TKinds,
      TSteps & StepEntry<N, C, O>,
      TParent
    >;
  }

  // Builds one step node, combining an optional branch guard with the step's own
  // `when` — delegates to the shared `appendStep`, used by createStep and branch.
  private pushStep(build: ErasedStepBuild, opts: ErasedStepOptions, guard?: RuntimeStepCondition): void {
    if (opts.name !== undefined) {
      claimName(opts.name, [this.stepNames]);
      this.stepNames[opts.name] = true;
    }
    appendStep(this.steps, build, opts, guard);
  }

  build(): Stepper<TForms, TShared, never, TSteps> {
    return new Stepper<TForms, TShared, never, TSteps>(
      this.forms as unknown as TForms,
      this.steps,
      new SharedState(this.sharedInit as TShared),
      this.resultResolver,
      this.controlTypes,
      this.providers,
    );
  }
}

// ── Recurrent flows ──
// A recurrent stepper is the second flow abstraction, equal in rank to `Stepper`:
// it can be the root handed to `<ngx-formad-stepper>`, and it can occupy one slot
// of another flow — in either direction, since a linear flow nests inside a
// recurrent one the same way. Topologically it is a ring: pass steps (authored
// first, gated on "a pass is open") around a dock (authored last, gated on the
// opposite). Finishing a pass folds its values into the flow's own collection and
// lands on the dock; the dock can only restart the ring or complete the flow.

// The erased flow-step options the node assembler takes: a `never`-typed gate
// parameter accepts any typed condition (contravariance).
interface ErasedFlowStepOptions {
  readonly label?: Reactive<string>;
  readonly when?: (ctx: never) => boolean;
  readonly defer?: DeferTrigger;
}

// The one place a flow step node is assembled. The parent-side `completeWhen`
// mirrors the flow's own completeness against the absorbed collection, so a host
// that inspects the parent gate sees the truth without hand-wiring.
function flowStepNode(name: string, opts: ErasedFlowStepOptions, flow: RuntimeFlow): FlowStepNode {
  const complete = isRecurrent(flow) ? flow.complete : undefined;
  const seed = isRecurrent(flow) ? flow.seed : undefined;

  return {
    kind: SequenceNodeKind.Flow,
    name,
    flow,
    label: opts.label,
    when: opts.when as unknown as RuntimeStepCondition | undefined,
    defer: opts.defer,
    completeWhen: complete && seed ? (ctx) => complete(ctx.steps[name] ?? seed()) : undefined,
    incompleteMessage: isRecurrent(flow) ? flow.incompleteMessage : undefined,
  };
}

// Erases a built nested stepper to the runtime flow shape the controller drives.
function erasedFlow(stepper: Stepper<unknown, Rec, never, unknown>): FlowDefinition {
  return stepper as unknown as FlowDefinition;
}

/** After `dock()` nothing may follow — the dock is the ring's only exit. */
export interface RecurrentTerminal<TForms, TShared extends Rec, C> {
  build(): RecurrentStepper<TForms, TShared, C>;
}

/** A built recurrent wizard — hand it to `<ngx-formad-stepper>` via
 *  {@link asRecurrentStepper}, or nest it through `createRecurrentStepper`. */
export class RecurrentStepper<TForms, TShared extends Rec, C> {
  /** Phantom carriers so a typed host can extract the declared shapes. */
  readonly __types?: { forms: TForms; shared: TShared; collection: C };

  /** @internal */
  constructor(readonly _def: RecurrentFlowDefinition) {}
}

/** The single, named place a recurrent stepper's types are erased for the runtime. */
export function asRecurrentStepper<TForms, TShared extends Rec, C>(
  stepper: RecurrentStepper<TForms, TShared, C>,
): RuntimeFlow {
  return stepper._def;
}

/** The root of a recurrent chain. Pass steps are authored with the same
 *  `createStep`/`branch`/`createStepper`/`createRecurrentStepper` vocabulary as a
 *  linear chain — every one of them is implicitly gated on "a pass is open", so
 *  every one reaches successors as `| undefined` — and the chain ends with
 *  `dock(...)`, the ring's hub. `fold` and `completeWhen` describe the collection
 *  and belong before the dock. */
export class RecurrentStepperBuilder<
  TForms = {},
  TShared extends Rec = {},
  C = unknown,
  TKinds extends string = BuiltInControlKind,
  TSteps = {},
  TParent = undefined,
> {
  /** Phantom — the accumulated step entries. */
  readonly __steps?: TSteps;

  private readonly forms: Record<string, AnyFormProvider> = {};
  private sharedInit: Rec = {};
  private readonly steps: SequenceNode[] = [];
  private readonly controlTypes: ControlTypeMap = {};
  private readonly providers: Provider[] = [];
  private readonly stepNames: Record<string, true> = {};
  private dockIndex = -1;
  private foldFn?: (collection: C, pass: StepContext<TShared, TSteps, TParent>) => C;
  private completePredicate?: (collection: C) => boolean;
  private completeMessage?: string;
  private readonly port: FlowPort<C>;
  private readonly hasAnyFn: (collection: C) => boolean;

  constructor(
    private readonly seedFn: () => C,
    hasAny?: (collection: C) => boolean,
  ) {
    this.port = new FlowPort(seedFn);
    this.hasAnyFn = hasAny ?? defaultHasAny;
  }

  /** The live read on the collection, for authoring component inputs. */
  get view(): FlowView<C> {
    return this.port;
  }

  /** Declares the flow's dependencies — see `StepperBuilder.provide`. */
  provide(...providers: Provider[]): this {
    this.providers.push(...providers);
    return this;
  }

  /** The flow's own per-pass GLOBAL state; reset between passes. Intersects over
   *  the parent shape the flow already reads. */
  withState<S extends Rec>(
    initial: S,
  ): RecurrentStepperBuilder<TForms, TShared & S, C, TKinds, TSteps, TParent> {
    this.sharedInit = { ...this.sharedInit, ...initial };
    return this as unknown as RecurrentStepperBuilder<TForms, TShared & S, C, TKinds, TSteps, TParent>;
  }

  createForm<K extends string, M extends Rec>(
    name: K,
    provider: FormProvider<M>,
  ): RecurrentStepperBuilder<TForms & Record<K, FormConfig<M>>, TShared, C, TKinds, TSteps, TParent> {
    claimName(name, [this.forms]);
    this.forms[name] = provider as unknown as AnyFormProvider;
    return this as unknown as RecurrentStepperBuilder<
      TForms & Record<K, FormConfig<M>>,
      TShared,
      C,
      TKinds,
      TSteps,
      TParent
    >;
  }

  addControlType<K extends string>(
    kind: K extends TKinds ? never : K,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    component: Type<FormValueControl<any>>,
  ): RecurrentStepperBuilder<TForms, TShared, C, TKinds | K, TSteps, TParent> {
    this.controlTypes[kind as string] = component;
    return this as unknown as RecurrentStepperBuilder<TForms, TShared, C, TKinds | K, TSteps, TParent>;
  }

  overrideControlType<K extends TKinds>(
    kind: K,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    component: Type<FormValueControl<any>>,
  ): this {
    this.controlTypes[kind] = component;
    return this;
  }

  /** A pass step — gated on "a pass is open", so the whole pass leaves the
   *  sequence the moment the pass closes; successors see it as `| undefined`. */
  createStep<N extends string = never, P = {}>(
    build: StepBuild<TForms, TShared, TSteps, TParent, P>,
    opts: StepOptions<TShared, TSteps, TParent, N> = {},
  ): RecurrentStepperBuilder<
    TForms,
    TShared,
    C,
    TKinds,
    TSteps & GatedEntry<N, StepInstance<TForms, P>>,
    TParent
  > {
    this.pushStep(build as unknown as ErasedStepBuild, opts as unknown as ErasedStepOptions, passGate);
    return this as unknown as RecurrentStepperBuilder<
      TForms,
      TShared,
      C,
      TKinds,
      TSteps & GatedEntry<N, StepInstance<TForms, P>>,
      TParent
    >;
  }

  /** A branch of pass steps: [pass open] AND [branch key] AND each step's own `when`. */
  branch<
    K extends string,
    B extends Record<
      K,
      (b: BranchBuilder<TForms, TShared, TSteps, TParent, {}>) => { __added?: unknown }
    >,
  >(
    select: BranchSelect<TShared, TSteps, TParent, K>,
    branches: B,
  ): RecurrentStepperBuilder<TForms, TShared, C, TKinds, TSteps & BranchAdded<B>, TParent> {
    const erased = select as unknown as (ctx: RuntimeStepContext) => string | null | undefined;
    for (const key of Object.keys(branches) as K[]) {
      const guard: RuntimeStepCondition = (ctx) => passGate(ctx) && erased(ctx) === key;
      branches[key](
        new BranchBuilder<TForms, TShared, TSteps, TParent, {}>(
          (b, o, g) => this.pushStep(b, o, g),
          guard,
        ),
      );
    }

    return this as unknown as RecurrentStepperBuilder<
      TForms,
      TShared,
      C,
      TKinds,
      TSteps & BranchAdded<B>,
      TParent
    >;
  }

  /** A nested linear flow as a pass step — the symmetric direction. */
  createStepper<
    N extends string,
    F2,
    S2 extends Rec,
    TK2 extends string,
    TS2,
    O extends FlowStepOptions<TShared, TSteps, TParent>,
  >(
    name: N,
    opts: O,
    build: (
      sub: StepperBuilder<{}, TShared, TKinds, {}, StepContext<TShared, TSteps, TParent>>,
    ) => StepperBuilder<F2, S2, TK2, TS2, StepContext<TShared, TSteps, TParent>>,
  ): RecurrentStepperBuilder<
    TForms,
    TShared,
    C,
    TKinds,
    TSteps & GatedEntry<N, StepsCommitted<TS2>>,
    TParent
  > {
    claimName(name, [this.stepNames]);
    this.stepNames[name] = true;
    const sub = new StepperBuilder() as StepperBuilder<
      {},
      TShared,
      TKinds,
      {},
      StepContext<TShared, TSteps, TParent>
    >;
    const chained = build(sub);
    const node = flowStepNode(name, opts, erasedFlow(chained.build()));
    this.steps.push({ ...node, when: combineConditions(passGate, node.when) });

    return this as unknown as RecurrentStepperBuilder<
      TForms,
      TShared,
      C,
      TKinds,
      TSteps & GatedEntry<N, StepsCommitted<TS2>>,
      TParent
    >;
  }

  /** A nested recurrent flow as a pass step — a ring within a ring. */
  createRecurrentStepper<N extends string, C2, O extends FlowStepOptions<TShared, TSteps, TParent>>(
    name: N,
    cfg: RecurrentCfg<C2, TShared, TSteps, TParent> & O,
    build: (
      loop: RecurrentStepperBuilder<{}, TShared, C2, TKinds, {}, StepContext<TShared, TSteps, TParent>>,
      view: FlowView<C2>,
    ) => unknown,
  ): RecurrentStepperBuilder<TForms, TShared, C, TKinds, TSteps & GatedEntry<N, C2>, TParent> {
    claimName(name, [this.stepNames]);
    this.stepNames[name] = true;
    const loop = new RecurrentStepperBuilder<
      {},
      TShared,
      C2,
      TKinds,
      {},
      StepContext<TShared, TSteps, TParent>
    >(cfg.collection, cfg.hasAny);
    build(loop, loop.view);
    const node = flowStepNode(name, cfg, loop._drain() as RecurrentFlowDefinition);
    this.steps.push({ ...node, when: combineConditions(passGate, node.when) });

    return this as unknown as RecurrentStepperBuilder<
      TForms,
      TShared,
      C,
      TKinds,
      TSteps & GatedEntry<N, C2>,
      TParent
    >;
  }

  /** How a finished pass enters the collection. Pure: return a NEW collection —
   *  the runtime is the collection's only writer. The pass context carries the
   *  pass steps' live instances (`pass.steps.<name>`, each possibly skipped). */
  fold(fold: (collection: C, pass: StepContext<TShared, TSteps, TParent>) => C): this {
    this.foldFn = fold;
    return this;
  }

  /** The flow's validity — a property of the collection, never of the path taken
   *  to it. Gates Next on the dock, and mirrors onto the parent slot's gate. */
  completeWhen(complete: (collection: C) => boolean, message?: string): this {
    this.completePredicate = complete;
    this.completeMessage = message;
    return this;
  }

  /** The ring's hub and only exit — authored LAST. Visible exactly when no pass is
   *  open; entry lands here whenever the collection already satisfies `hasAny`. */
  dock<N extends string = never, P = {}>(
    build: StepBuild<TForms, TShared, TSteps, TParent, P>,
    opts: StepOptions<TShared, TSteps, TParent, N> = {},
  ): RecurrentTerminal<TForms, TShared, C> {
    if (this.dockIndex >= 0) throw new Error('A recurrent flow has exactly one dock.');

    this.dockIndex = this.steps.length;
    const own = opts.completeWhen as unknown as RuntimeStepCondition | undefined;
    const gate: RuntimeStepCondition = (ctx) => {
      if (own && !own(ctx)) return false;
      if (!this.completePredicate) return true;

      return this.completePredicate((ctx.flow ? ctx.flow.collection() : this.seedFn()) as C);
    };
    this.pushStep(
      build as unknown as ErasedStepBuild,
      {
        ...opts,
        completeWhen: gate as unknown as ErasedStepOptions['completeWhen'],
        incompleteMessage: opts.incompleteMessage ?? this.completeMessage,
      } as unknown as ErasedStepOptions,
      dockGate,
    );

    return this as unknown as RecurrentTerminal<TForms, TShared, C>;
  }

  build(): RecurrentStepper<TForms, TShared, C> {
    return new RecurrentStepper(this._drain() as RecurrentFlowDefinition);
  }

  /** @internal the typed runtime flow — erased once, by the callers that hand it
   *  to the erased node tree. */
  _drain(): RecurrentFlowDefinition<C> {
    if (this.dockIndex < 0) {
      throw new Error('A recurrent flow needs a dock - author it last with dock().');
    }

    return {
      recurrent: true,
      steps: this.steps,
      forms: this.forms,
      shared: new SharedState(this.sharedInit),
      controlTypes: this.controlTypes,
      providers: this.providers,
      dockAt: this.dockIndex,
      seed: this.seedFn,
      fold: this.foldFn as unknown as ((collection: C, pass: RuntimeStepContext) => C) | undefined,
      hasAny: this.hasAnyFn,
      complete: this.completePredicate,
      incompleteMessage: this.completeMessage,
      port: this.port,
    };
  }

  private pushStep(build: ErasedStepBuild, opts: ErasedStepOptions, guard?: RuntimeStepCondition): void {
    if (opts.name !== undefined) {
      claimName(opts.name, [this.stepNames]);
      this.stepNames[opts.name] = true;
    }
    appendStep(this.steps, build, opts, guard);
  }
}

// The two halves of the ring's visibility: pass steps exist while a pass is open,
// the dock exactly otherwise. Both read the flow signals the controller supplies.
const passGate: RuntimeStepCondition = (ctx) => ctx.flow?.passOpen() === true;
const dockGate: RuntimeStepCondition = (ctx) => ctx.flow?.passOpen() !== true;

function defaultHasAny<C>(collection: C): boolean {
  if (Array.isArray(collection)) return collection.length > 0;

  return collection != null;
}
