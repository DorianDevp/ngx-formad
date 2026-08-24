import { Type } from '@angular/core';
import { FormConfig } from '../form-config/form-config';
import { StandardSchemaOf } from './standard-schema';

// The typed surface a step's `when` condition is written against, plus the lazy
// form provider. Everything here is keyed on the same `TForms`/`TShared` the
// `Stepper` carries, so the built wizard is the single source of truth: authoring
// (`createStep` opts), the erased node the runtime stores, and any typed host all
// use the *same* generic at different instantiations — never a parallel twin.

/** A pooled standalone value control (`createControl`): a `FormValueControl`
 *  component wrapped, at materialization, in an implicit single-value field tree.
 *  It lives in the same `TForms` map as the forms, so `value(...)`, step
 *  conditions, and commits treat it as one more named value — the runtime just
 *  discriminates on `control` instead of the config/loader shape. */
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

/** Extracts a pooled entry's value type: a form's model, or a control's value.
 *  A lazily-loaded form still records `FormConfig<M>`, so one case covers both
 *  eager and lazy forms. */
export type FormModel<F> =
  F extends ControlEntry<infer T, infer _C> ? T : F extends FormConfig<infer M> ? M : never;

/** The pool keys that are standalone controls — what `addControl` may select. */
export type ControlKeys<TForms> = {
  [K in keyof TForms]: TForms[K] extends ControlEntry<infer _T, infer _C> ? K : never;
}[keyof TForms];

/** The pool keys that are forms — what `addForm` may select. */
export type FormKeys<TForms> = Exclude<keyof TForms, ControlKeys<TForms>>;

/** The component class of a pooled control entry. */
export type ControlComponent<F> = F extends ControlEntry<infer _T, infer C> ? C : never;

/** Which native `@defer` trigger the bundled shell uses for a step that opts into
 *  deferred rendering. Bring-your-own-UI hosts can read the hint and pick freely. */
export type DeferTrigger = 'idle' | 'viewport' | 'interaction';

/** The typed context a step condition reads. Both type params come from the built
 *  stepper (its form pool and shared-state shape), so `shared` and `value(...)`
 *  are checked against the exact wizard you declared. */
export interface StepContext<TForms, TShared> {
  /** The cross-step shared state, typed as declared by `withState`; reactive at runtime. */
  readonly shared: TShared;
  /** The last-committed value of an earlier step's form (its model) or standalone
   *  control (its raw value), keyed by pool name. `undefined` until that step has
   *  been left (committed) at least once. */
  value<K extends keyof TForms>(form: K): FormModel<TForms[K]> | undefined;
}

/** A step condition, typed against the forms pool and shared state. */
export type StepCondition<TForms, TShared> = (ctx: StepContext<TForms, TShared>) => boolean;

/** A form supplied lazily — its config is fetched only when its step is reached. */
export type FormLoader<M extends Record<string, unknown>> = () => Promise<FormConfig<M>>;

/** A form supplied eagerly or lazily. Both narrow `TForms` to `FormConfig<M>`, so
 *  `addForm` / `bind` / `value()` typings are identical whichever you use. */
export type FormProvider<M extends Record<string, unknown>> = FormConfig<M> | FormLoader<M>;

// ── Erased instantiations the runtime stores and evaluates ──
// These are the same generics applied to the erased pool/shared shapes, not new
// definitions — exactly mirroring how `RuntimeStepper` erases `Stepper`.

/** The erased pool entry the runtime walks: a config or a loader, keyed by name. */
export type AnyFormProvider = FormProvider<Record<string, unknown>>;

/** The erased control entry the runtime materializes. */
export type AnyControlEntry = ControlEntry<unknown, unknown>;

/** The erased shared shape the runtime stores. Controls sit beside forms, so an
 *  erased `value(...)` read is `unknown` — precision lives on the authored side. */
type ErasedForms = Record<string, FormConfig<Record<string, unknown>> | AnyControlEntry>;
type ErasedShared = Record<string, unknown>;

/** The erased step context the shell reconstructs at runtime. */
export type RuntimeStepContext = StepContext<ErasedForms, ErasedShared>;
/** The erased step condition stored on a `StepNode`. */
export type RuntimeStepCondition = StepCondition<ErasedForms, ErasedShared>;
/** The erased result resolver a fork stores on the `Stepper` — given the runtime
 *  context, returns the active arm's outcome (or undefined before one is chosen). */
export type RuntimeResultResolver = (ctx: RuntimeStepContext) => unknown;
