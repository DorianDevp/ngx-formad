import { FormConfig } from '../form-config/form-config';

// The typed surface a step's `when` condition is written against, plus the lazy
// form provider. Everything here is keyed on the same `TForms`/`TShared` the
// `Stepper` carries, so the built wizard is the single source of truth: authoring
// (`createStep` opts), the erased node the runtime stores, and any typed host all
// use the *same* generic at different instantiations — never a parallel twin.

/** Extracts a pooled form's model type. A lazily-loaded form still records
 *  `FormConfig<M>`, so this single case covers both eager and lazy forms. */
export type FormModel<F> = F extends FormConfig<infer M> ? M : never;

/** Which native `@defer` trigger the bundled shell uses for a step that opts into
 *  deferred rendering. Bring-your-own-UI hosts can read the hint and pick freely. */
export type DeferTrigger = 'idle' | 'viewport' | 'interaction';

/** The typed context a step condition reads. Both type params come from the built
 *  stepper (its form pool and shared-state shape), so `shared` and `value(...)`
 *  are checked against the exact wizard you declared. */
export interface StepContext<TForms, TShared> {
  /** The cross-step shared state, typed as declared by `withState`; reactive at runtime. */
  readonly shared: TShared;
  /** The last-committed model of an earlier step's form, keyed by its pool name.
   *  `undefined` until that step has been left (committed) at least once. */
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

/** The erased shared shape the runtime stores. */
type ErasedForms = Record<string, FormConfig<Record<string, unknown>>>;
type ErasedShared = Record<string, unknown>;

/** The erased step context the shell reconstructs at runtime. */
export type RuntimeStepContext = StepContext<ErasedForms, ErasedShared>;
/** The erased step condition stored on a `StepNode`. */
export type RuntimeStepCondition = StepCondition<ErasedForms, ErasedShared>;
