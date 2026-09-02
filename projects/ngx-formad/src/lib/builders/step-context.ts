import { Signal } from '@angular/core';
import { FormConfig } from '../form-config/form-config';
import { FormState } from '../renderer/instantiate-form';

/** The erased record shape the runtime walks by string key; the single erasure alias for models and stores. */
export type ErasedRecord = Record<string, unknown>;

/** The erased value shape at the runtime boundary; the single erasure alias for values. */
export type ErasedValue = unknown;

/** A compile-time refusal whose property name states the reason. */
export type Rejected<Reason extends string> = { readonly 'ngx-formad': Reason };

/** The model type of a pooled form template. */
export type FormModel<F> = F extends FormConfig<infer M> ? M : never;

/** The pool names `addForm` may select. */
export type FormKeys<TForms> = keyof TForms;

/** Which native `@defer` trigger a step body renders under. */
export enum DeferTrigger {
  Idle = 'idle',
  Viewport = 'viewport',
  Interaction = 'interaction',
}

/** The live instance a placed template becomes: its `FormState`. */
export type InstanceOf<F> = F extends FormConfig<infer M> ? FormState<M> : never;

/** One step's live instances by pool name, for the names `P` the step placed. */
export type StepInstance<TForms, P> = {
  readonly [K in keyof P & keyof TForms]: InstanceOf<TForms[K]>;
};

/** The shared store as one read-only signal per key. */
export type SharedSignals<TShared> = { readonly [K in keyof TShared]: Signal<TShared[K]> };

/** A recurrent flow's live state: the folded accumulator and whether a pass is open. */
export interface RecurrentSignals<C = unknown> {
  readonly state: Signal<C>;

  readonly passOpen: Signal<boolean>;
}

/** What a step reads: named predecessors, the shared store, the enclosing ring, the parent flow. */
export interface StepContext<
  TShared = ErasedRecord,
  TSteps = RuntimeSteps,
  TParent = undefined,
  TFlow = undefined,
> {
  readonly steps: TSteps;

  readonly shared: SharedSignals<TShared>;

  readonly flow: TFlow;

  readonly parent: TParent;

  readonly __shared?: TShared;
}

export type SharedOf<TCtx> = TCtx extends { readonly __shared?: infer S extends ErasedRecord }
  ? S
  : ErasedRecord;

export type StepsOf<TCtx> = TCtx extends { readonly steps: infer S } ? S : never;

export type ParentOf<TCtx> = TCtx extends { readonly parent: infer P } ? P : never;

export type FlowOf<TCtx> = TCtx extends { readonly flow: infer F } ? F : never;

/** The context with a shared slice layered in. */
export type WithShared<TCtx, S> = StepContext<
  SharedOf<TCtx> & S,
  StepsOf<TCtx>,
  ParentOf<TCtx>,
  FlowOf<TCtx>
>;

/** The context with a step entry added. */
export type WithSteps<TCtx, E> = StepContext<
  SharedOf<TCtx>,
  StepsOf<TCtx> & E,
  ParentOf<TCtx>,
  FlowOf<TCtx>
>;

/** The context a gate reads: every predecessor optional, since a gate may run before it exists. */
export type GateContext<TCtx> = StepContext<
  SharedOf<TCtx>,
  { readonly [K in keyof StepsOf<TCtx>]?: StepsOf<TCtx>[K] },
  ParentOf<TCtx>,
  FlowOf<TCtx>
>;

/** The context a nested linear flow starts from: its own step namespace, this level as `parent`. */
export type ChildContext<TCtx> = StepContext<SharedOf<TCtx>, {}, TCtx, FlowOf<TCtx>>;

/** The context a nested ring starts from: its own steps, this level as `parent`, its ring as `flow`. */
export type RingContext<TCtx, C> = StepContext<SharedOf<TCtx>, {}, TCtx, RecurrentSignals<C>>;

/** A reactive step gate. */
export type StepCondition<TCtx> = (ctx: GateContext<TCtx>) => boolean;

/** A form config fetched when its step is reached. */
export type FormLoader<M extends ErasedRecord> = () => Promise<FormConfig<M>>;

/** A form template: the config itself or a loader for it. */
export type FormProvider<M extends ErasedRecord> = FormConfig<M> | FormLoader<M>;

/** The erased pool entry the runtime resolves by name. */
export type AnyFormProvider = FormProvider<ErasedRecord>;

/** One step's instances as the runtime holds them, by pool name. */
export type RuntimeStepInstance = Readonly<ErasedRecord>;

/** Every step's instances by step key, as the runtime holds them. */
export type RuntimeSteps = Readonly<Record<string, ErasedValue>>;

/** The erased context the runtime builds and hands to erased callbacks. */
export interface RuntimeStepContext
  extends StepContext<ErasedRecord, RuntimeSteps, RuntimeStepContext | undefined, RecurrentSignals | undefined> {}

/** An erased gate, as a node stores it. */
export type RuntimeStepCondition = (ctx: RuntimeStepContext) => boolean;

/** An erased fork result resolver, as a stepper stores it. */
export type RuntimeResultResolver = (ctx: RuntimeStepContext) => ErasedValue;

/** An erased `initial` seed, as a form node stores it. */
export type RuntimeFormSeed = (ctx: RuntimeStepContext) => Partial<ErasedRecord>;
