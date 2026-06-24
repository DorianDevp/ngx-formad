import { Type } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { FormConfig } from '../form-config/form-config';
import { ControlTypeMap } from '../provide';
import { SharedState } from '../sync/shared-state';
import { ComponentCfg, toBindings } from './dynamic-component';

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
import { LayoutNode, PageNode, PageOptions, StepNode } from './nodes';
import { FieldRef, FieldRefs, recordLinks, selectedKey, SharedLink } from './shared-link';
import {
  AnyFormProvider,
  DeferTrigger,
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

/** Builds the contents of one page. Also used for nested rows (it returns `this`). */
export class PageBuilder<TForms, TShared extends Record<string, unknown>> {
  private readonly children: LayoutNode[] = [];

  /** A bare layout slot — a spacer, a full-width gap. */
  addContent(cfg: { layout?: string } = {}): this {
    this.children.push({ kind: 'content', layout: cfg.layout });
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
  addForm<K extends keyof TForms & string>(
    select: (forms: FieldRefs<TForms>) => FieldRef<K, unknown>,
    opts: {
      submitLabel?: string;
      visibleWhen?: () => boolean;
      bind?: (link: SharedLink<FormModel<TForms[K]>, TShared>) => void;
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

  drain(): StepNode {
    return { pages: this.pages };
  }
}

// How a branch hands a step back to the parent builder, carrying the branch guard.
type PushStep<TForms, TShared extends Record<string, unknown>> = (
  build: (step: StepBuilder<TForms, TShared>) => unknown,
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
    build: (step: StepBuilder<TForms, TShared>) => unknown,
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
  target: StepNode[],
  build: (step: StepBuilder<TForms, TShared>) => unknown,
  opts: StepOptions<Stepper<TForms, TShared>>,
  guard?: RuntimeStepCondition,
): void {
  const step = new StepBuilder<TForms, TShared>();
  build(step);
  target.push({
    ...step.drain(),
    when: combineConditions(guard, opts.when as unknown as RuntimeStepCondition | undefined),
    optional: opts.optional,
    defer: opts.defer,
    completeWhen: opts.completeWhen,
  });
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
  readonly steps: readonly StepNode[];
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
  private readonly steps: StepNode[] = [];

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
    build: (step: StepBuilder<TForms, TShared>) => unknown,
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
    readonly steps: readonly StepNode[],
    readonly shared: SharedState<TShared>,
    /** Set by `fork`: maps the runtime context to the active arm's result. */
    readonly resolveResult?: RuntimeResultResolver,
    /** Wizard-scoped control kinds (from `addControlType`/`overrideControlType`),
     *  layered over the global adapter by the shell for this stepper's subtree. */
    readonly controlTypes: ControlTypeMap = {},
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
  /** Drops the step from the sequence when it returns false; reactive. */
  readonly when?: StepConditionFor<S>;
  /** Marks the step skippable — the shell shows a Skip that bypasses the gate. */
  readonly optional?: boolean;
  /** Renders the step body inside an `@defer` block with this trigger. */
  readonly defer?: DeferTrigger;
  /** An extra completion guard, ANDed with the form fold so a step driven by
   *  dynamic components (which contribute no fields to fold) can still gate Next
   *  on its own state. Reactive — read shared/external signals here. */
  readonly completeWhen?: () => boolean;
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
  private sharedInit: Record<string, unknown> = {};
  private readonly steps: StepNode[] = [];
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

  /** Declares the cross-step shared state; narrows `TShared`. */
  withState<S extends Record<string, unknown>>(initial: S): StepperBuilder<TForms, S, TKinds> {
    this.sharedInit = initial;
    return this as unknown as StepperBuilder<TForms, S, TKinds>;
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

  /** Appends a step built from the typed pool and shared state. `opts.when`,
   *  `optional`, and `defer` ride on the step node; `when` is typed against the
   *  stepper this chain builds, then erased once here, where the node is stored. */
  createStep(
    build: (step: StepBuilder<TForms, TShared>) => unknown,
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

  // Builds one step node, combining an optional branch guard with the step's own
  // `when` — delegates to the shared `appendStep`, used by createStep and branch.
  private pushStep(
    build: (step: StepBuilder<TForms, TShared>) => unknown,
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
    );
  }
}
