import { Type } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { FormConfig } from '../form-config/form-config';
import { ControlTypeMap } from '../provide';
import { SharedState } from '../sync/shared-state';
import { ContentBuild, buildContent } from './content';
import { ComponentCfg, Reactive, toBindings, toGetter } from './dynamic-component';
import { StandardSchemaOf } from './standard-schema';

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
  AnyControlEntry,
  AnyFormProvider,
  ControlComponent,
  ControlEntry,
  ControlKeys,
  DeferTrigger,
  FlowEntry,
  FormKeys,
  FormModel,
  FormProvider,
  RuntimeResultResolver,
  RuntimeStepCondition,
  RuntimeStepContext,
  StepCondition,
  StepContext,
} from './step-context';

// One typed chain describes the whole wizard. Only `TForms` is threaded through
// the generics: `createForm` narrows it, and `addForm`/`bind` read it. There is
// no step/child tuple accumulator — nothing at a use site reads one, and the
// renderer walks plain `StepNode[]` generically. Per-call generics (`C`, `K`)
// still give full local inference.

// The erased pool entry. We don't bound the builder type params by this: a
// concrete `FormConfig<Account>` is not assignable to `FormConfig<Record<…>>`
// (the `schema` field makes it invariant in the model), so a bound would reject
// the very forms the chain creates. The precise types live on the per-call
// generics instead; this alias is only the erased shape the runtime walks.
type AnyForm = FormConfig<Record<string, unknown>>;

/** The shared keys whose type is exactly `T` — what a control's `bind` may pick.
 *  Mutual assignability, because the sync writes in both directions. */
type MatchingSharedKey<TShared, T> = {
  [K in keyof TShared]: TShared[K] extends T ? (T extends TShared[K] ? K : never) : never;
}[keyof TShared] &
  string;

/** Placement options for a pooled standalone control, typed to its component `C`
 *  and value `T`. `value` (and the state inputs `FormField` maintains) are bound
 *  by the runtime, so `inputs` covers only the component's own presentational
 *  surface. */
export interface ControlCfg<C, T, TShared> {
  readonly inputs?: ComponentCfg<Omit<C, 'value'>>['inputs'];
  readonly outputs?: ComponentCfg<Omit<C, 'value'>>['outputs'];
  /** The renderer auto-`@if`-gates the control on this; hidden controls leave the
   *  completion fold, like hidden forms. */
  readonly visibleWhen?: () => boolean;
  /** Layout classes for this control's slot. */
  readonly layout?: string;
  /** Sync the control's value with one shared-state key (seed on entry if
   *  pristine, commit on leave) — the directional engine forms use. */
  readonly bind?: MatchingSharedKey<TShared, T>;
}

/** Placement options for a content block: the slot's layout classes and the gate
 *  that hides the whole block. Per-tag classes and gates live on the tags. */
export interface ContentCfg {
  readonly layout?: string;
  readonly visibleWhen?: () => boolean;
}

/** Builds the contents of one page. Also used for nested rows (it returns `this`). */
export class PageBuilder<TForms, TShared extends Record<string, unknown>> {
  private readonly children: LayoutNode[] = [];

  /**
   * A content block - prose, a list, a link, a note - authored with the tag
   * builder, in its own layout slot. The markup is data like everything else here:
   * text and attributes may be getters, and `visibleWhen` gates the block, so the
   * author never writes a template or an `@if`.
   *
   * ```ts
   * page.addContent({ layout: 'notice' }, (c) =>
   *   c.p('Fragile items ship in their own box.')
   *    .p((p) => p.text('Pick one on the ').a('next step', { href: '#' }).text('.')),
   * );
   * ```
   *
   * With no build callback it is the bare slot it has always been - a spacer.
   *
   * The build comes first, like the component in `addComponent` and the build in
   * `formLayout(...).content(...)` - the options-first order is accepted too, so
   * neither habit is a trap.
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

  /** A nested layout group with its own classes. */
  insertRow(layout: string, build: (row: PageBuilder<TForms, TShared>) => unknown): this {
    const row = new PageBuilder<TForms, TShared>();
    build(row);
    this.children.push({ kind: 'row', layout, children: row.drain() });
    return this;
  }

  /** A form from the pool, selected by callback, optionally linked to shared state. */
  // `K` is inferred from the selected `FieldRef`'s `__key`, not from the indexed
  // return type `FieldRefs<TForms>[K]` — TS cannot infer a type param out of an
  // indexed access in return position and silently widens it to `keyof TForms`,
  // which would type `bind` against the union of every pooled model. Reading the
  // key off the ref pins `K` to the one form selected, so `FormModel` is exact.
  addForm<K extends FormKeys<TForms> & string>(
    select: (forms: FieldRefs<TForms>) => FieldRef<K, unknown>,
    opts: {
      submitLabel?: string;
      visibleWhen?: () => boolean;
      bind?: (link: SharedLink<FormModel<TForms[K]>, TShared>) => void;
      /** Wire a field's control outputs to patch the form model — e.g. a VAT-ID field
       *  whose `resolved` output fills in company name/address. */
      effects?: (e: FormEffects<FormModel<TForms[K]>>) => void;
    } = {},
  ): this {
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
    });
    return this;
  }

  /** A standalone control from the pool (`createControl`), selected by callback —
   *  the same idiom as `addForm`, and the same lifecycle underneath: its implicit
   *  field folds into completion and commits on leave. */
  addControl<K extends ControlKeys<TForms> & string>(
    select: (controls: FieldRefs<TForms>) => FieldRef<K, unknown>,
    opts: ControlCfg<ControlComponent<TForms[K]>, FormModel<TForms[K]>, TShared> = {},
  ): this {
    const name = selectedKey<TForms>(
      select as (f: FieldRefs<TForms>) => FieldRef<keyof TForms, unknown>,
    );
    this.children.push({
      kind: 'control',
      name,
      bindings: toBindings({ inputs: opts.inputs, outputs: opts.outputs }),
      visibleWhen: opts.visibleWhen,
      layout: opts.layout,
      sharedKey: opts.bind,
    });
    return this;
  }

  /** Hands the accumulated nodes to the parent; internal to the builders. */
  drain(): LayoutNode[] {
    return this.children;
  }
}

/** Builds one step out of one or more pages. */
export class StepBuilder<TForms, TShared extends Record<string, unknown>> {
  private readonly pages: PageNode[] = [];

  createPage(
    meta: { options: PageOptions },
    build: (page: PageBuilder<TForms, TShared>) => unknown,
  ): this {
    const page = new PageBuilder<TForms, TShared>();
    build(page);
    this.pages.push({ options: meta.options, children: page.drain() });
    return this;
  }

  /** Hands the accumulated pages to the parent; internal to the builders. */
  drainPages(): readonly PageNode[] {
    return this.pages;
  }
}

/** One step's build callback. Declaring the SECOND parameter makes the step
 *  DYNAMIC: the callback then runs when the step is reached, with the live
 *  condition context (a snapshot taken after the previous step committed), so the
 *  step's structure — which pooled forms it places, what prose it shows — can
 *  follow the user's earlier answers. It must be pure: a re-entry after a discard
 *  runs it again with fresh reads. A one-parameter callback builds plain data,
 *  once, exactly as before. */
export type StepBuild<TForms, TShared extends Record<string, unknown>> = (
  step: StepBuilder<TForms, TShared>,
  ctx: StepContext<TForms, TShared>,
) => unknown;

// How a branch hands a step back to the parent builder, carrying the branch guard.
type PushStep<TForms, TShared extends Record<string, unknown>> = (
  build: StepBuild<TForms, TShared>,
  opts: StepOptions<Stepper<TForms, TShared>>,
  guard: RuntimeStepCondition,
) => void;

/** Authors the steps of one branch. Every step it adds is guarded by the branch's
 *  condition, so it only runs when that branch is selected. Branches can nest. */
export class BranchBuilder<TForms, TShared extends Record<string, unknown>> {
  constructor(
    private readonly push: PushStep<TForms, TShared>,
    private readonly guard: RuntimeStepCondition,
  ) {}

  /** A step in this branch — same shape as `createStep`, guarded by the branch. */
  step(
    build: StepBuild<TForms, TShared>,
    opts: StepOptions<Stepper<TForms, TShared>> = {},
  ): this {
    this.push(build, opts, this.guard);
    return this;
  }

  /** A nested split: each inner step is guarded by *this* branch AND the inner key. */
  branch<K extends string>(
    select: (ctx: StepContext<TForms, TShared>) => K,
    branches: Record<K, (branch: BranchBuilder<TForms, TShared>) => void>,
  ): this {
    const erased = select as unknown as (ctx: RuntimeStepContext) => string;
    for (const key of Object.keys(branches) as K[]) {
      const nested: RuntimeStepCondition = (ctx) => this.guard(ctx) && erased(ctx) === key;
      branches[key](new BranchBuilder<TForms, TShared>(this.push, nested));
    }
    return this;
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
function appendStep<TForms, TShared extends Record<string, unknown>>(
  target: SequenceNode[],
  build: StepBuild<TForms, TShared>,
  opts: StepOptions<Stepper<TForms, TShared>>,
  guard?: RuntimeStepCondition,
): void {
  target.push({
    kind: SequenceNodeKind.Step,
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
function pagesOf<TForms, TShared extends Record<string, unknown>>(
  build: StepBuild<TForms, TShared>,
): readonly PageNode[] | DynamicPages {
  if (build.length >= 2) {
    return (ctx) => {
      const step = new StepBuilder<TForms, TShared>();
      build(step, ctx as unknown as StepContext<TForms, TShared>);
      return step.drainPages();
    };
  }

  const step = new StepBuilder<TForms, TShared>();
  build(step, undefined as unknown as StepContext<TForms, TShared>);
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
  readonly sharedInit: Record<string, unknown>;
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
 *  in a required `result(...)`. Everything here is local to the arm. */
export class ForkArmBuilder<TForms, TShared extends Record<string, unknown>> {
  private readonly forms: Record<string, AnyFormProvider> = {};
  private readonly sharedInit: Record<string, unknown> = {};
  private readonly steps: SequenceNode[] = [];

  /** Arm-local shared state, merged into the wizard's store. */
  withState<S extends Record<string, unknown>>(initial: S): ForkArmBuilder<TForms, TShared & S> {
    Object.assign(this.sharedInit, initial);
    return this as unknown as ForkArmBuilder<TForms, TShared & S>;
  }

  /** Arm-local form, eager or lazy; narrows the arm's pool. */
  createForm<K extends string, M extends Record<string, unknown>>(
    name: K,
    provider: FormProvider<M>,
  ): ForkArmBuilder<TForms & Record<K, FormConfig<M>>, TShared> {
    this.forms[name] = provider as unknown as AnyFormProvider;
    return this as unknown as ForkArmBuilder<TForms & Record<K, FormConfig<M>>, TShared>;
  }

  /** A step in this arm — same shape as `createStep`. */
  createStep(
    build: StepBuild<TForms, TShared>,
    opts: StepOptions<Stepper<TForms, TShared>> = {},
  ): this {
    appendStep(this.steps, build, opts);
    return this;
  }

  /** A branch within this arm — sugar over guarded steps, as elsewhere. */
  branch<K extends string>(
    select: (ctx: StepContext<TForms, TShared>) => K,
    branches: Record<K, (branch: BranchBuilder<TForms, TShared>) => void>,
  ): this {
    const erased = select as unknown as (ctx: RuntimeStepContext) => string;
    for (const key of Object.keys(branches) as K[]) {
      const guard: RuntimeStepCondition = (ctx) => erased(ctx) === key;
      branches[key](
        new BranchBuilder<TForms, TShared>((b, o, g) => appendStep(this.steps, b, o, g), guard),
      );
    }
    return this;
  }

  /** Declares this arm's typed result and terminates the arm. */
  result<R>(resolve: (ctx: StepContext<TForms, TShared>) => R): ForkArm<R> {
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
export interface TerminalForkBuilder<TForms, TShared extends Record<string, unknown>, TResult> {
  build(): Stepper<TForms, TShared, TResult>;
}

/** The shape of a `fork`'s arms map: each key authors an arm ending in a result. */
type ForkArms<TForms, TShared extends Record<string, unknown>> = Record<
  string,
  (arm: ForkArmBuilder<TForms, TShared>) => ForkArm<unknown>
>;

/** The union of every arm's result type — the stepper's discriminated `TResult`.
 *  Inferring per arm (not a single shared `R`) is what lets the arms differ. */
type ArmResult<A> = {
  [P in keyof A]: A[P] extends (arm: ForkArmBuilder<any, any>) => ForkArm<infer R> ? R : never;
}[keyof A];

/** A built wizard: its typed form pool, its step tree, its shared store, and —
 *  if it forks — a resolver for the active arm's discriminated result. `TResult` is
 *  `never` unless the chain forks. */
export class Stepper<TForms, TShared extends Record<string, unknown>, TResult = never> {
  constructor(
    readonly forms: TForms,
    readonly steps: readonly SequenceNode[],
    readonly shared: SharedState<TShared>,
    /** Set by `fork`: maps the runtime context to the active arm's result. */
    readonly resolveResult?: RuntimeResultResolver,
    /** Wizard-scoped control kinds (from `addControlType`/`overrideControlType`),
     *  layered over the global adapter by the shell for this stepper's subtree. */
    readonly controlTypes: ControlTypeMap = {},
    /** Standalone value controls (`createControl`), keyed by pool name. Typed on
     *  `TForms` alongside the forms; this is the erased runtime pool. */
    readonly controls: Record<string, AnyControlEntry> = {},
  ) {}
}

/** A stepper with its precise pool/shared/result types erased, as the runtime sees it. */
export type RuntimeStepper = Stepper<Record<string, AnyForm>, Record<string, unknown>, unknown>;

// The built `Stepper` is the source of truth for step conditions: these pull its
// form pool and shared shape back out, so a `when` predicate — at authoring time
// or in a typed host — reads `shared` and `value(...)` against the exact wizard.
/** The form pool of a built stepper. */
export type StepperForms<S> = S extends Stepper<infer F, any, any> ? F : never;
/** The shared-state shape of a built stepper. */
export type StepperShared<S> = S extends Stepper<any, infer Sh, any> ? Sh : never;
/** The discriminated result type of a (forked) built stepper. */
export type StepperResult<S> = S extends Stepper<any, any, infer R> ? R : never;
/** The typed step context derived from a built stepper. */
export type StepContextFor<S extends Stepper<any, any, any>> = StepContext<
  StepperForms<S>,
  StepperShared<S>
>;
/** A step condition typed against a built stepper. */
export type StepConditionFor<S extends Stepper<any, any, any>> = StepCondition<
  StepperForms<S>,
  StepperShared<S>
>;

/** Per-step options, typed against the stepper the step belongs to. */
export interface StepOptions<S extends Stepper<any, any, any>> {
  /** The step's short name for a chrome's progress rail - reactive, so it can
   *  follow state. A chrome reads the whole visible list off the controller
   *  (`labels`), which is derived from the same effective sequence as
   *  `index`/`total`, so the rail cannot drift out of step with the flow. */
  readonly label?: Reactive<string>;
  /** Drops the step from the sequence when it returns false; reactive. */
  readonly when?: StepConditionFor<S>;
  /** Marks the step skippable — the shell shows a Skip that bypasses the gate. */
  readonly optional?: boolean;
  /** Renders the step body inside an `@defer` block with this trigger. */
  readonly defer?: DeferTrigger;
  /** An extra completion guard, ANDed with the form fold so a step driven by
   *  dynamic components (which contribute no fields to fold) can still gate Next
   *  on its own state. Reads the same typed context as `when` (`shared` and
   *  committed `value(...)`); external signals read inside it also track. */
  readonly completeWhen?: StepConditionFor<S>;
  /** Shown in the chrome's blocker list when `completeWhen` is what holds Next
   *  back. Without it the user gets a generic "not complete yet" — say what is
   *  actually missing ("Pick a plan to continue"). */
  readonly incompleteMessage?: string;
}

// The chain is typed for authoring; the runtime walks the pool by string name
// and the shared store by string key, so it works on an erased view. `SharedState`
// is invariant in its state type, so this widening needs one explicit step —
// the single, named place that erasure happens, like `asRenderable` for a form.
export function asStepper<TForms, TShared extends Record<string, unknown>, TResult = never>(
  stepper: Stepper<TForms, TShared, TResult>,
): RuntimeStepper {
  return stepper as unknown as RuntimeStepper;
}

/** The value type a `FormValueControl` component edits — read off its `value`
 *  model, so the component itself is the single source of the entry's type. */
export type ControlValueOf<C> = C extends FormValueControl<infer T> ? T : never;

/** Declaration options for `createControl`. */
export interface ControlOptions<T> {
  /** The value the implicit field starts from (or a factory, for a fresh object
   *  per materialization — the same convention as a form's `model`). */
  readonly initial: T | (() => T);
  /** A Standard Schema (zod 4, valibot, arktype) validating the value. Failed
   *  issues make the control invalid — Next blocks and the issues' messages show
   *  in the blocker list, so the gate explains itself. */
  readonly schema?: StandardSchemaOf<T>;
  /** The name used for this control in the blocker list; defaults to its pool name. */
  readonly label?: string;
}

/** The root of the chain. Each method narrows or appends; `build()` freezes it.
 *  `TKinds` tracks the registered control kinds (seeded with the built-ins) so
 *  `addControlType` rejects a name that already exists. */
export class StepperBuilder<
  TForms = {},
  TShared extends Record<string, unknown> = {},
  TKinds extends string = BuiltInControlKind,
> {
  // The pool stores configs or lazy loaders; the runtime resolves loaders on reach.
  private readonly forms: Record<string, AnyFormProvider> = {};
  // Standalone controls live in their own runtime pool (they materialize through
  // a different path), but share the `TForms` type map with the forms.
  private readonly controls: Record<string, AnyControlEntry> = {};
  private sharedInit: Record<string, unknown> = {};
  private readonly steps: SequenceNode[] = [];
  private resultResolver?: RuntimeResultResolver;
  private readonly controlTypes: ControlTypeMap = {};

  /** Registers a NEW control kind for this wizard (resolved before the global
   *  adapter and the built-ins). Re-adding an existing kind is a compile error —
   *  use {@link overrideControlType} to replace one. */
  addControlType<K extends string>(
    kind: K extends TKinds ? never : K,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    component: Type<FormValueControl<any>>,
  ): StepperBuilder<TForms, TShared, TKinds | K> {
    this.controlTypes[kind as string] = component;
    return this as unknown as StepperBuilder<TForms, TShared, TKinds | K>;
  }

  /** Replaces an existing control kind (a built-in, or one added earlier) for this
   *  wizard. The kind must already exist — to introduce one use {@link addControlType}. */
  overrideControlType<K extends TKinds>(
    kind: K,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    component: Type<FormValueControl<any>>,
  ): StepperBuilder<TForms, TShared, TKinds> {
    this.controlTypes[kind] = component;
    return this;
  }

  /** Declares the cross-step shared state; narrows `TShared` by intersection, so
   *  a nested flow's own state layers over the parent shape it already sees. */
  withState<S extends Record<string, unknown>>(
    initial: S,
  ): StepperBuilder<TForms, TShared & S, TKinds> {
    // A copy: `fork` merges each arm's state into this object, and a caller who
    // passed a shared constant would otherwise find their own literal carrying
    // keys from a wizard built somewhere else.
    this.sharedInit = { ...this.sharedInit, ...initial };
    return this as unknown as StepperBuilder<TForms, TShared & S, TKinds>;
  }

  /** Registers a form in the pool under `name`; narrows `TForms`. The provider may
   *  be the config itself or a loader (`() => Promise<FormConfig<M>>`) for a form
   *  whose definition is fetched only when its step is reached — either way the
   *  pool type records `FormConfig<M>`, so `addForm`/`bind`/`value` are unchanged. */
  createForm<K extends string, M extends Record<string, unknown>>(
    name: K,
    provider: FormProvider<M>,
  ): StepperBuilder<TForms & Record<K, FormConfig<M>>, TShared, TKinds> {
    this.forms[name] = provider as unknown as AnyFormProvider;
    return this as unknown as StepperBuilder<TForms & Record<K, FormConfig<M>>, TShared, TKinds>;
  }

  /** Registers a standalone value control in the pool under `name`; narrows
   *  `TForms` beside the forms. The component must implement `FormValueControl`
   *  (its `value` model is the source of the entry's value type), and the runtime
   *  wraps it in an implicit single-value field tree — so its validity folds into
   *  step completion, its value commits on leave into `value(name)` / `committed`,
   *  and an optional Standard Schema (zod 4, valibot, arktype) validates it
   *  natively. Place it on a page with `addControl`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createControl<K extends string, C extends FormValueControl<any>>(
    name: K,
    component: Type<C>,
    opts: ControlOptions<ControlValueOf<C>>,
  ): StepperBuilder<TForms & Record<K, ControlEntry<ControlValueOf<C>, C>>, TShared, TKinds> {
    const entry: ControlEntry<ControlValueOf<C>, C> = {
      control: true,
      component,
      initial: toGetter(opts.initial),
      schema: opts.schema,
      label: opts.label,
    };
    this.controls[name] = entry;
    return this as unknown as StepperBuilder<
      TForms & Record<K, ControlEntry<ControlValueOf<C>, C>>,
      TShared,
      TKinds
    >;
  }

  /** Appends a step built from the typed pool and shared state. `opts.when`,
   *  `optional`, and `defer` ride on the step node; `when` is typed against the
   *  stepper this chain builds, then erased once here, where the node is stored. */
  createStep(
    build: StepBuild<TForms, TShared>,
    opts: StepOptions<Stepper<TForms, TShared>> = {},
  ): this {
    this.pushStep(build, opts);
    return this;
  }

  /**
   * Splits the flow into branches by a runtime selector. Each branch's steps are
   * appended guarded by `select(ctx) === key`, so at run time only the chosen
   * branch's steps survive the effective-sequence filter — and any steps added
   * after the branch are ungated, so the branches **rejoin automatically**. This
   * is pure sugar over `createStep({ when })`: the runtime is unchanged, and the
   * selector reads the same typed context as a condition, so you can branch on
   * `shared` or on a previous step's `value(...)`.
   */
  branch<K extends string>(
    select: (ctx: StepContext<TForms, TShared>) => K,
    branches: Record<K, (branch: BranchBuilder<TForms, TShared>) => void>,
  ): this {
    const erased = select as unknown as (ctx: RuntimeStepContext) => string;
    for (const key of Object.keys(branches) as K[]) {
      const guard: RuntimeStepCondition = (ctx) => erased(ctx) === key;
      branches[key](
        new BranchBuilder<TForms, TShared>((build, opts, g) => this.pushStep(build, opts, g), guard),
      );
    }
    return this;
  }

  /**
   * Forks the flow: a selector commits the wizard to one arm, and each arm is its
   * own sub-flow with its own state, forms, steps, and a typed `result`. Unlike
   * `branch`, arms do **not** rejoin — `fork` returns a terminal builder (only
   * `build()`), and the stepper's result type becomes the union of the arms'
   * results. Arm steps compile to guarded steps (so navigation reuses the engine),
   * and the arms' results compile to a single resolver picking the active one.
   */
  fork<A extends ForkArms<TForms, TShared>>(
    // The selector returns a branch key; a value with no matching arm means "no arm
    // chosen yet" (e.g. before the user decides) — no arm steps, no result.
    select: (ctx: StepContext<TForms, TShared>) => string,
    arms: A,
  ): TerminalForkBuilder<TForms, TShared, ArmResult<A>> {
    const erased = select as unknown as (ctx: RuntimeStepContext) => string;
    const resolvers: Record<string, RuntimeResultResolver> = {};
    for (const key of Object.keys(arms) as (keyof A & string)[]) {
      const def = arms[key](new ForkArmBuilder<TForms, TShared>())._def;
      Object.assign(this.forms, def.forms);
      Object.assign(this.sharedInit, def.sharedInit);
      const guard: RuntimeStepCondition = (ctx) => erased(ctx) === key;
      for (const node of def.steps) {
        this.steps.push({ ...node, when: combineConditions(guard, node.when) });
      }
      resolvers[key] = def.resolve;
    }
    this.resultResolver = (ctx) => resolvers[erased(ctx)]?.(ctx);
    return this as unknown as TerminalForkBuilder<TForms, TShared, ArmResult<A>>;
  }

  /**
   * A nested linear flow occupying ONE slot of this sequence. It owns its form
   * pool and its shared state (layered over this wizard's for reads), renders
   * through the same root chrome via a child controller, and commits its record
   * of values under `name` — readable by later conditions as `value(name)`.
   */
  createStepper<K extends string, F2, S2 extends Record<string, unknown>, TK2 extends string>(
    name: K extends keyof TForms & string ? never : K,
    opts: FlowStepOptions<Stepper<TForms, TShared>>,
    build: (sub: StepperBuilder<{}, TShared, TKinds>) => StepperBuilder<F2, S2, TK2>,
  ): StepperBuilder<TForms & Record<K, FlowEntry<Committed<F2>>>, TShared, TKinds> {
    const sub = new StepperBuilder() as StepperBuilder<{}, TShared, TKinds>;
    const chained = build(sub);
    this.steps.push(flowStepNode(name as string, opts, erasedFlow(chained.build())));
    return this as unknown as StepperBuilder<
      TForms & Record<K, FlowEntry<Committed<F2>>>,
      TShared,
      TKinds
    >;
  }

  /**
   * A nested recurrent flow — a ring of pass steps around a dock — occupying ONE
   * slot of this sequence. Its collection accumulates by the flow's own pure
   * `fold` and commits under `name`; `view` hands components authored inside the
   * flow a read on that collection (`all()` / `others()`).
   */
  createRecurrentStepper<K extends string, C>(
    name: K extends keyof TForms & string ? never : K,
    cfg: RecurrentCfg<C, Stepper<TForms, TShared>>,
    build: (
      loop: RecurrentStepperBuilder<{}, TShared, C, TKinds>,
      view: FlowView<C>,
    ) => unknown,
  ): StepperBuilder<TForms & Record<K, FlowEntry<C>>, TShared, TKinds> {
    const loop = new RecurrentStepperBuilder<{}, TShared, C, TKinds>(cfg.collection, cfg.hasAny);
    build(loop, loop.view);
    // The single place this flow's collection type is erased for the node tree.
    const flow = loop._drain() as RecurrentFlowDefinition;
    this.steps.push(flowStepNode(name as string, cfg, flow));
    return this as unknown as StepperBuilder<TForms & Record<K, FlowEntry<C>>, TShared, TKinds>;
  }

  // Builds one step node, combining an optional branch guard with the step's own
  // `when` — delegates to the shared `appendStep`, used by createStep and branch.
  private pushStep(
    build: StepBuild<TForms, TShared>,
    opts: StepOptions<Stepper<TForms, TShared>>,
    guard?: RuntimeStepCondition,
  ): void {
    appendStep(this.steps, build, opts, guard);
  }

  build(): Stepper<TForms, TShared> {
    return new Stepper(
      this.forms as unknown as TForms,
      this.steps,
      new SharedState(this.sharedInit as TShared),
      this.resultResolver,
      this.controlTypes,
      this.controls,
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

/** Options for a nested flow step — the parent-side slot, not the flow itself. */
export interface FlowStepOptions<S extends Stepper<any, any, any>> {
  readonly label?: Reactive<string>;
  readonly when?: StepConditionFor<S>;
  readonly defer?: DeferTrigger;
}

/** Declaration of a nested recurrent flow: its collection seed and, optionally,
 *  a non-default "the dock is reachable" predicate. */
export interface RecurrentCfg<C, S extends Stepper<any, any, any>> extends FlowStepOptions<S> {
  /** A fresh collection — the accumulator's starting value; its return type fixes
   *  the flow's collection type. */
  readonly collection: () => C;
  /** Defaults to `length > 0` for arrays, `!= null` otherwise. */
  readonly hasAny?: (collection: C) => boolean;
}

/** What a nested linear flow commits under its name: its forms' and controls'
 *  last-committed values, keyed by pool name. */
export type Committed<F> = { readonly [K in keyof F]?: FormModel<F[K]> };

// The one place a flow step node is assembled. The parent-side `completeWhen`
// mirrors the flow's own completeness against the absorbed collection, so a host
// that inspects the parent gate sees the truth without hand-wiring.
function flowStepNode(
  name: string,
  opts: FlowStepOptions<Stepper<unknown, Record<string, unknown>>>,
  flow: RuntimeFlow,
): FlowStepNode {
  const complete = isRecurrent(flow) ? flow.complete : undefined;
  const seed = isRecurrent(flow) ? flow.seed : undefined;
  return {
    kind: SequenceNodeKind.Flow,
    name,
    flow,
    label: opts.label,
    when: opts.when as unknown as RuntimeStepCondition | undefined,
    defer: opts.defer,
    completeWhen: complete && seed ? (ctx) => complete(ctx.value(name) ?? seed()) : undefined,
    incompleteMessage: isRecurrent(flow) ? flow.incompleteMessage : undefined,
  };
}

// Erases a built nested stepper to the runtime flow shape the controller drives.
function erasedFlow(stepper: Stepper<unknown, Record<string, unknown>>): FlowDefinition {
  return stepper as unknown as FlowDefinition;
}

/** After `dock()` nothing may follow — the dock is the ring's only exit. */
export interface RecurrentTerminal<TForms, TShared extends Record<string, unknown>, C> {
  build(): RecurrentStepper<TForms, TShared, C>;
}

/** A built recurrent wizard — hand it to `<ngx-formad-stepper>` via
 *  {@link asRecurrentStepper}, or nest it through `createRecurrentStepper`. */
export class RecurrentStepper<TForms, TShared extends Record<string, unknown>, C> {
  /** Phantom carriers so a typed host can extract the declared shapes. */
  readonly __types?: { forms: TForms; shared: TShared; collection: C };

  /** @internal */
  constructor(readonly _def: RecurrentFlowDefinition) {}
}

/** The single, named place a recurrent stepper's types are erased for the runtime. */
export function asRecurrentStepper<TForms, TShared extends Record<string, unknown>, C>(
  stepper: RecurrentStepper<TForms, TShared, C>,
): RuntimeFlow {
  return stepper._def;
}

/** The root of a recurrent chain. Pass steps are authored with the same
 *  `createStep`/`branch`/`createStepper`/`createRecurrentStepper` vocabulary as a
 *  linear chain — every one of them is implicitly gated on "a pass is open" — and
 *  the chain ends with `dock(...)`, the ring's hub. `fold` and `completeWhen`
 *  describe the collection and belong before the dock. */
export class RecurrentStepperBuilder<
  TForms = {},
  TShared extends Record<string, unknown> = {},
  C = unknown,
  TKinds extends string = BuiltInControlKind,
> {
  private readonly forms: Record<string, AnyFormProvider> = {};
  private readonly controls: Record<string, AnyControlEntry> = {};
  private sharedInit: Record<string, unknown> = {};
  private readonly steps: SequenceNode[] = [];
  private readonly controlTypes: ControlTypeMap = {};
  private dockIndex = -1;
  private foldFn?: (collection: C, pass: StepContext<TForms, TShared>) => C;
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

  /** The flow's own per-pass state; reset between passes. Intersects over the
   *  parent shape the flow already reads. */
  withState<S extends Record<string, unknown>>(
    initial: S,
  ): RecurrentStepperBuilder<TForms, TShared & S, C, TKinds> {
    this.sharedInit = { ...this.sharedInit, ...initial };
    return this as unknown as RecurrentStepperBuilder<TForms, TShared & S, C, TKinds>;
  }

  createForm<K extends string, M extends Record<string, unknown>>(
    name: K,
    provider: FormProvider<M>,
  ): RecurrentStepperBuilder<TForms & Record<K, FormConfig<M>>, TShared, C, TKinds> {
    this.forms[name] = provider as unknown as AnyFormProvider;
    return this as unknown as RecurrentStepperBuilder<
      TForms & Record<K, FormConfig<M>>,
      TShared,
      C,
      TKinds
    >;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createControl<K extends string, Cmp extends FormValueControl<any>>(
    name: K,
    component: Type<Cmp>,
    opts: ControlOptions<ControlValueOf<Cmp>>,
  ): RecurrentStepperBuilder<
    TForms & Record<K, ControlEntry<ControlValueOf<Cmp>, Cmp>>,
    TShared,
    C,
    TKinds
  > {
    const entry: ControlEntry<ControlValueOf<Cmp>, Cmp> = {
      control: true,
      component,
      initial: toGetter(opts.initial),
      schema: opts.schema,
      label: opts.label,
    };
    this.controls[name] = entry;
    return this as unknown as RecurrentStepperBuilder<
      TForms & Record<K, ControlEntry<ControlValueOf<Cmp>, Cmp>>,
      TShared,
      C,
      TKinds
    >;
  }

  addControlType<K extends string>(
    kind: K extends TKinds ? never : K,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    component: Type<FormValueControl<any>>,
  ): RecurrentStepperBuilder<TForms, TShared, C, TKinds | K> {
    this.controlTypes[kind as string] = component;
    return this as unknown as RecurrentStepperBuilder<TForms, TShared, C, TKinds | K>;
  }

  overrideControlType<K extends TKinds>(
    kind: K,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    component: Type<FormValueControl<any>>,
  ): RecurrentStepperBuilder<TForms, TShared, C, TKinds> {
    this.controlTypes[kind] = component;
    return this;
  }

  /** A pass step — gated on "a pass is open", so the whole pass leaves the
   *  sequence the moment the pass closes. */
  createStep(
    build: StepBuild<TForms, TShared>,
    opts: StepOptions<Stepper<TForms, TShared>> = {},
  ): this {
    appendStep(this.steps, build, opts, passGate);
    return this;
  }

  /** A branch of pass steps: [pass open] AND [branch key] AND each step's own `when`. */
  branch<K extends string>(
    select: (ctx: StepContext<TForms, TShared>) => K,
    branches: Record<K, (branch: BranchBuilder<TForms, TShared>) => void>,
  ): this {
    const erased = select as unknown as (ctx: RuntimeStepContext) => string;
    for (const key of Object.keys(branches) as K[]) {
      const guard: RuntimeStepCondition = (ctx) => passGate(ctx) && erased(ctx) === key;
      branches[key](
        new BranchBuilder<TForms, TShared>((b, o, g) => appendStep(this.steps, b, o, g), guard),
      );
    }
    return this;
  }

  /** A nested linear flow as a pass step — the symmetric direction. */
  createStepper<K extends string, F2, S2 extends Record<string, unknown>, TK2 extends string>(
    name: K extends keyof TForms & string ? never : K,
    opts: FlowStepOptions<Stepper<TForms, TShared>>,
    build: (sub: StepperBuilder<{}, TShared, TKinds>) => StepperBuilder<F2, S2, TK2>,
  ): RecurrentStepperBuilder<TForms & Record<K, FlowEntry<Committed<F2>>>, TShared, C, TKinds> {
    const sub = new StepperBuilder() as StepperBuilder<{}, TShared, TKinds>;
    const chained = build(sub);
    const node = flowStepNode(name as string, opts, erasedFlow(chained.build()));
    this.steps.push({ ...node, when: combineConditions(passGate, node.when) });
    return this as unknown as RecurrentStepperBuilder<
      TForms & Record<K, FlowEntry<Committed<F2>>>,
      TShared,
      C,
      TKinds
    >;
  }

  /** A nested recurrent flow as a pass step — a ring within a ring. */
  createRecurrentStepper<K extends string, C2>(
    name: K extends keyof TForms & string ? never : K,
    cfg: RecurrentCfg<C2, Stepper<TForms, TShared>>,
    build: (
      loop: RecurrentStepperBuilder<{}, TShared, C2, TKinds>,
      view: FlowView<C2>,
    ) => unknown,
  ): RecurrentStepperBuilder<TForms & Record<K, FlowEntry<C2>>, TShared, C, TKinds> {
    const loop = new RecurrentStepperBuilder<{}, TShared, C2, TKinds>(cfg.collection, cfg.hasAny);
    build(loop, loop.view);
    const node = flowStepNode(name as string, cfg, loop._drain() as RecurrentFlowDefinition);
    this.steps.push({ ...node, when: combineConditions(passGate, node.when) });
    return this as unknown as RecurrentStepperBuilder<
      TForms & Record<K, FlowEntry<C2>>,
      TShared,
      C,
      TKinds
    >;
  }

  /** How a finished pass enters the collection. Pure: return a NEW collection —
   *  the runtime is the collection's only writer. The pass context carries the
   *  pass's committed `value(...)` reads and its shared snapshot. */
  fold(fold: (collection: C, pass: StepContext<TForms, TShared>) => C): this {
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
  dock(
    build: StepBuild<TForms, TShared>,
    opts: StepOptions<Stepper<TForms, TShared>> = {},
  ): RecurrentTerminal<TForms, TShared, C> {
    if (this.dockIndex >= 0) throw new Error('A recurrent flow has exactly one dock.');
    this.dockIndex = this.steps.length;
    const own = opts.completeWhen as unknown as RuntimeStepCondition | undefined;
    const gate: RuntimeStepCondition = (ctx) => {
      if (own && !own(ctx)) return false;
      if (!this.completePredicate) return true;
      return this.completePredicate((ctx.flow ? ctx.flow.collection : this.seedFn()) as C);
    };
    appendStep(
      this.steps,
      build,
      {
        ...opts,
        completeWhen: gate as unknown as StepOptions<Stepper<TForms, TShared>>['completeWhen'],
        incompleteMessage: opts.incompleteMessage ?? this.completeMessage,
      },
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
      controls: this.controls,
      shared: new SharedState(this.sharedInit),
      controlTypes: this.controlTypes,
      dockAt: this.dockIndex,
      seed: this.seedFn,
      fold: this.foldFn as ((collection: C, pass: RuntimeStepContext) => C) | undefined,
      hasAny: this.hasAnyFn,
      complete: this.completePredicate,
      incompleteMessage: this.completeMessage,
      port: this.port,
    };
  }
}

// The two halves of the ring's visibility: pass steps exist while a pass is open,
// the dock exactly otherwise. Both read the flow context the controller supplies.
const passGate: RuntimeStepCondition = (ctx) => ctx.flow?.passOpen === true;
const dockGate: RuntimeStepCondition = (ctx) => ctx.flow?.passOpen !== true;

function defaultHasAny<C>(collection: C): boolean {
  if (Array.isArray(collection)) return collection.length > 0;
  return collection != null;
}
