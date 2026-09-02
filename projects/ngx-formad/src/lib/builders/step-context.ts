import { Signal, Type } from '@angular/core';
import { FieldTree } from '@angular/forms/signals';
import { FormConfig } from '../form-config/form-config';
import { FormState } from '../renderer/instantiate-form';
import { StandardSchemaOf } from './standard-schema';

// The typed surface a step's callbacks are written against. The pool (`TForms`)
// holds TEMPLATES — a form config is instantiated by the step that places it, so
// the same config in two steps is two independent instances. What a later step
// reads is therefore keyed by STEP, never by form name: `ctx.steps.<name>` is the
// named predecessor's live instances by pool name. Everything in the context is
// reactive (signals), so a condition, a fold, a dynamic step or a component with
// the context injected all read the same live tree — no snapshots.

/** A pooled standalone value control (`createControl`): a `FormValueControl`
 *  component wrapped, at materialization, in an implicit single-value field tree.
 *  It lives in the same `TForms` map as the forms, so placement and instances
 *  treat it as one more named entry — the runtime just discriminates on
 *  `control` instead of the config/loader shape. */
export interface ControlEntry<T, C = unknown> {
  /** Discriminates a pooled control from a pooled form provider. */
  readonly control: true;
  readonly component: Type<C>;
  readonly initial: () => T;
  /** Failed issues make the implicit field invalid, which blocks Next exactly
   *  like an invalid form field — no `completeWhen` needed to gate a selection. */
  readonly schema?: StandardSchemaOf<T>;
  /** The name shown when this control's errors appear in a step's blocker list. */
  readonly label?: string;
}

/** A pooled nested flow (`createStepper` / `createRecurrentStepper`). Its value
 *  reaches successors under the flow's name in `ctx.steps`: a recurrent flow's
 *  folded collection, a linear sub-flow's committed record. */
export interface FlowEntry<C> {
  readonly flow: true;
  /** Phantom — present only so `FormModel` can extract the flow's value type. */
  readonly __value?: C;
}

/** Extracts a pooled entry's value type: a form's model, a control's value, or a
 *  nested flow's committed value. A lazily-loaded form still records
 *  `FormConfig<M>`, so one case covers both eager and lazy forms. */
export type FormModel<F> =
  F extends FlowEntry<infer C>
    ? C
    : F extends ControlEntry<infer T, infer _C>
      ? T
      : F extends FormConfig<infer M>
        ? M
        : never;

/** The pool keys that are standalone controls — what `addControl` may select. */
export type ControlKeys<TForms> = {
  [K in keyof TForms]: TForms[K] extends ControlEntry<infer _T, infer _C> ? K : never;
}[keyof TForms];

/** The pool keys that are nested flows — never placed by `addForm`/`addControl`
 *  (a flow renders through its own controller). */
export type FlowKeys<TForms> = {
  [K in keyof TForms]: TForms[K] extends FlowEntry<infer _C> ? K : never;
}[keyof TForms];

/** The pool keys that are forms — what `addForm` may select. */
export type FormKeys<TForms> = Exclude<keyof TForms, ControlKeys<TForms> | FlowKeys<TForms>>;

/** The component class of a pooled control entry. */
export type ControlComponent<F> = F extends ControlEntry<infer _T, infer C> ? C : never;

/** Which native `@defer` trigger the bundled shell uses for a step that opts into
 *  deferred rendering. Bring-your-own-UI hosts can read the hint and pick freely. */
export type DeferTrigger = 'idle' | 'viewport' | 'interaction';

// ── Instances ──

/** A live standalone control as a step exposes it: its field tree and its value. */
export interface LiveControlInstance<T> {
  readonly field: FieldTree<T>;

  value(): T;
}

/** The live instance behind one pooled entry. */
export type InstanceOf<F> =
  F extends ControlEntry<infer T, infer _C>
    ? LiveControlInstance<T>
    : F extends FormConfig<infer M>
      ? FormState<M>
      : never;

/** What one step exposes to its successors: its live instances by pool name.
 *  `P` is the record of names the step PLACED (`addForm`/`addControl`), inferred
 *  from the step's build callback — a form placed on only some paths of a dynamic
 *  step is absent from the type, as it may be absent at runtime. */
export type StepInstance<TForms, P> = {
  readonly [K in keyof P & keyof TForms]: InstanceOf<TForms[K]>;
};

// ── Context ──

/** The cross-step shared store as signals — the GLOBAL state of a flow, one per
 *  key, layered over the parent flow's. */
export type SharedSignals<TShared> = { readonly [K in keyof TShared]: Signal<TShared[K]> };

/** What a step inside a recurrent flow knows about its ring. */
export interface FlowSignals<C = unknown> {
  readonly collection: Signal<C>;

  readonly passOpen: Signal<boolean>;
}

/** The context a step's callbacks read. `TSteps` is the accumulated record of
 *  named predecessors ON THIS LEVEL (a step under `when` is `| undefined`);
 *  `TParent` is the enclosing flow's context, or `undefined` at the root — a
 *  nested flow has its own namespace of step names and reaches the level above
 *  explicitly through `parent`. */
export interface StepContext<TShared, TSteps, TParent = undefined> {
  readonly steps: TSteps;

  readonly shared: SharedSignals<TShared>;

  /** Present inside a recurrent flow (own ring, or the nearest enclosing one). */
  readonly flow?: FlowSignals;

  readonly parent: TParent;
}

/** The context a GATE reads — `when`, `completeWhen`, a branch selector, a fork's
 *  result. Gates are evaluated at any time for every step (the rail needs them),
 *  so no predecessor is guaranteed to exist yet: every entry is optional here,
 *  while the step's own build callback (entry-time) sees unconditional
 *  predecessors as present. */
export type GateContext<TShared, TSteps, TParent = undefined> = StepContext<
  TShared,
  { readonly [K in keyof TSteps]?: TSteps[K] },
  TParent
>;

/** A step condition. */
export type StepCondition<TShared, TSteps, TParent = undefined> = (
  ctx: GateContext<TShared, TSteps, TParent>,
) => boolean;

/** A form supplied lazily — its config is fetched only when its step is reached. */
export type FormLoader<M extends Record<string, unknown>> = () => Promise<FormConfig<M>>;

/** A form supplied eagerly or lazily. Both narrow `TForms` to `FormConfig<M>`, so
 *  `addForm` / `bind` / instances are typed identically whichever you use. */
export type FormProvider<M extends Record<string, unknown>> = FormConfig<M> | FormLoader<M>;

// ── Erased instantiations the runtime stores and evaluates ──
// These are the same shapes applied to erased pools, not new definitions —
// exactly mirroring how `RuntimeStepper` erases `Stepper`.

/** The erased pool entry the runtime walks: a config or a loader, keyed by name. */
export type AnyFormProvider = FormProvider<Record<string, unknown>>;

/** The erased control entry the runtime materializes. */
export type AnyControlEntry = ControlEntry<unknown, unknown>;

/** One step's instances as the runtime holds them: pool name → `FormState`,
 *  `LiveControlInstance`, or (for a nested flow) its egress value. */
export type RuntimeStepInstance = Readonly<Record<string, unknown>>;

/** The erased step context the runtime reconstructs. */
export interface RuntimeStepContext {
  readonly steps: Readonly<Record<string, RuntimeStepInstance | undefined>>;

  readonly shared: Readonly<Record<string, Signal<unknown>>>;

  readonly flow?: FlowSignals;

  readonly parent: RuntimeStepContext | undefined;
}

/** The erased step condition stored on a node. */
export type RuntimeStepCondition = (ctx: RuntimeStepContext) => boolean;

/** The erased result resolver a fork stores on the `Stepper` — given the runtime
 *  context, returns the active arm's outcome (or undefined before one is chosen). */
export type RuntimeResultResolver = (ctx: RuntimeStepContext) => unknown;

/** The erased seed a form node carries: entry context → partial model. */
export type RuntimeFormSeed = (ctx: RuntimeStepContext) => Partial<Record<string, unknown>>;
