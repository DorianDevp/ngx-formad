import { Signal } from '@angular/core';
import { FormConfig, RuntimeFormConfig } from '../form-config/form-config';
import { Rejected } from '../form-config/rejected';
import { FormState } from '../renderer/instantiate-form';

/** The config a pool entry resolves to: itself, or what its loader yields. */
export type ConfigOf<F> = F extends () => Promise<infer C> ? C : F;

/** The model type of a pooled form template. */
export type FormModel<F> = ConfigOf<F> extends { model(): infer M extends Record<string, unknown> } ? M : never;

/** The authored ui of a pooled form template. */
export type FormUi<F> = ConfigOf<F> extends { readonly ui: infer U } ? U : never;

/** The components a pooled form template's layout placed, by field. */
export type FormPlaced<F> = ConfigOf<F> extends { readonly layout?: { readonly __placed?: infer P } } ? P : {};


/** The pool names `addForm` may place. */
export type FormKeys<TForms> = keyof TForms & string;

/** Which native `@defer` trigger a step body renders under. */
export enum DeferTrigger {
  Idle = 'idle',
  Viewport = 'viewport',
  Interaction = 'interaction',
}

/** The live instance a placed template becomes. */
export type InstanceOf<F> = [FormModel<F>] extends [never] ? never : FormState<FormModel<F>>;

/**
 * One step's live instances by name, for the forms `P` the step placed: each typed by the template placed there —
 * the pool entry it named, or the config given at the page. `TForms` stays for the signatures that carry it.
 */
export type StepInstance<TForms, P> = {
  readonly [K in keyof P]: InstanceOf<P[K]>;
};

/** A shared store as one read-only signal per key. */
export type SharedSignals<TShared extends Record<string, unknown> = Record<string, unknown>> = {
  readonly [K in keyof TShared]: Signal<TShared[K]>;
};

/** A ring's live state: the folded accumulator and whether a pass is open. */
export interface RecurrentSignals<C = unknown> {
  readonly state: Signal<C>;

  readonly passOpen: Signal<boolean>;
}

/** What a step reads: named predecessors, the shared store, the enclosing ring and the parent flow. */
export interface StepperContext<
  TShared extends SharedSignals = SharedSignals,
  TSteps extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  TParent extends RuntimeStepperContext | undefined = RuntimeStepperContext | undefined,
  TFlow extends RecurrentSignals | undefined = RecurrentSignals | undefined,
> {
  readonly steps: TSteps;

  readonly shared: TShared;

  readonly flow: TFlow;

  readonly parent: TParent;
}

/** The context the runtime builds; every typed context is assignable to it. */
export interface RuntimeStepperContext extends StepperContext {}

/** The context of a linear root: nothing before it, no shared keys, no ring. */
export type RootContext = StepperContext<SharedSignals<{}>, {}, undefined, undefined>;

/** The context with a shared slice layered in. */
export type WithShared<TCtx extends RuntimeStepperContext, S extends Record<string, unknown>> = StepperContext<
  TCtx['shared'] & SharedSignals<S>,
  TCtx['steps'],
  TCtx['parent'],
  TCtx['flow']
>;

/** The context with a step entry added. */
export type WithSteps<TCtx extends RuntimeStepperContext, E> = StepperContext<
  TCtx['shared'],
  TCtx['steps'] & E,
  TCtx['parent'],
  TCtx['flow']
>;

/**
 * The context a fork's selector and arm results read: every predecessor optional, since the flow's `result` may be
 * resolved before they exist. A step gate reads the typed context itself — it is asked only once its predecessors are.
 */
export type GateContext<TCtx extends RuntimeStepperContext> = StepperContext<
  TCtx['shared'],
  { readonly [K in keyof TCtx['steps']]?: TCtx['steps'][K] },
  TCtx['parent'],
  TCtx['flow']
>;

/** The context a nested linear flow starts from: its own step namespace, this level as `parent`. */
export type ChildContext<TCtx extends RuntimeStepperContext> = StepperContext<
  TCtx['shared'],
  {},
  TCtx,
  TCtx['flow']
>;

/** The context a nested ring starts from: its own steps, this level as `parent`, its ring as `flow`. */
export type RingContext<TCtx extends RuntimeStepperContext, C> = StepperContext<
  TCtx['shared'],
  {},
  TCtx,
  RecurrentSignals<C>
>;

/**
 * What a callback inside a step reads: the level above, plus the step's own form instances by pool name. Which of them
 * a page places is decided by the very callback that reads this, so every entry is optional.
 */
export type StepContext<TCtx extends RuntimeStepperContext, TForms> = TCtx & {
  readonly forms: { readonly [K in keyof TForms]?: InstanceOf<TForms[K]> };
};

/** The context the runtime builds for a step; every typed step context is assignable to it. */
export type RuntimeStepContext = RuntimeStepperContext & { readonly forms: Readonly<Record<string, FormState>> };

/**
 * A reactive step gate as authored against a typed context. Asked only once every step before it has been entered or
 * skipped, so an ungated predecessor is there as its type says; a gated one may have been skipped, hence `| undefined`.
 */
export type StepCondition<TCtx extends RuntimeStepperContext> = (ctx: TCtx) => boolean;

/** A step gate as a node holds it; a typed `StepCondition` fits `activeWhen` because it is a method parameter. */
export interface StepGate {
  activeWhen(ctx: RuntimeStepperContext): boolean;
}

/** A form config fetched when its step is reached. */
export type FormLoader<M extends Record<string, unknown>> = () => Promise<FormConfig<M>>;

/** A form template: the config itself or a loader for it. */
export type FormProvider<M extends Record<string, unknown>> = FormConfig<M> | FormLoader<M>;

/** The pool entry the runtime resolves by name; every typed provider is assignable to it. */
export type AnyFormProvider = RuntimeFormConfig | (() => Promise<RuntimeFormConfig>);
