import { Signal } from '@angular/core';
import { FormConfig, RuntimeFormConfig } from '../form-config/form-config';
import { FormState } from '../renderer/instantiate-form';

/** A compile-time refusal whose property name states the reason. */
export type Rejected<Reason extends string> = { readonly 'ngx-formad': Reason };

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

/** One step's live instances by pool name, for the names `P` the step placed. */
export type StepInstance<TForms, P> = {
  readonly [K in keyof P & keyof TForms]: InstanceOf<TForms[K]>;
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
export interface StepContext<
  TShared extends SharedSignals = SharedSignals,
  TSteps extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  TParent extends RuntimeStepContext | undefined = RuntimeStepContext | undefined,
  TFlow extends RecurrentSignals | undefined = RecurrentSignals | undefined,
> {
  readonly steps: TSteps;

  readonly shared: TShared;

  readonly flow: TFlow;

  readonly parent: TParent;
}

/** The context the runtime builds; every typed context is assignable to it. */
export interface RuntimeStepContext extends StepContext {}

/** The context of a linear root: nothing before it, no shared keys, no ring. */
export type RootContext = StepContext<SharedSignals<{}>, {}, undefined, undefined>;

/** The context with a shared slice layered in. */
export type WithShared<TCtx extends RuntimeStepContext, S extends Record<string, unknown>> = StepContext<
  TCtx['shared'] & SharedSignals<S>,
  TCtx['steps'],
  TCtx['parent'],
  TCtx['flow']
>;

/** The context with a step entry added. */
export type WithSteps<TCtx extends RuntimeStepContext, E> = StepContext<
  TCtx['shared'],
  TCtx['steps'] & E,
  TCtx['parent'],
  TCtx['flow']
>;

/** The context a gate reads: every predecessor optional, since a gate may run before it exists. */
export type GateContext<TCtx extends RuntimeStepContext> = StepContext<
  TCtx['shared'],
  { readonly [K in keyof TCtx['steps']]?: TCtx['steps'][K] },
  TCtx['parent'],
  TCtx['flow']
>;

/** The context a nested linear flow starts from: its own step namespace, this level as `parent`. */
export type ChildContext<TCtx extends RuntimeStepContext> = StepContext<
  TCtx['shared'],
  {},
  TCtx,
  TCtx['flow']
>;

/** The context a nested ring starts from: its own steps, this level as `parent`, its ring as `flow`. */
export type RingContext<TCtx extends RuntimeStepContext, C> = StepContext<
  TCtx['shared'],
  {},
  TCtx,
  RecurrentSignals<C>
>;

/** A reactive step gate as authored against a typed context. */
export type StepCondition<TCtx extends RuntimeStepContext> = (ctx: GateContext<TCtx>) => boolean;

/** A step gate as a node holds it; a typed `StepCondition` fits `when` because it is a method parameter. */
export interface StepGate {
  when(ctx: RuntimeStepContext): boolean;
}

/** A form config fetched when its step is reached. */
export type FormLoader<M extends Record<string, unknown>> = () => Promise<FormConfig<M>>;

/** A form template: the config itself or a loader for it. */
export type FormProvider<M extends Record<string, unknown>> = FormConfig<M> | FormLoader<M>;

/** The pool entry the runtime resolves by name; every typed provider is assignable to it. */
export type AnyFormProvider = RuntimeFormConfig | (() => Promise<RuntimeFormConfig>);
