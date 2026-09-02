import { Signal } from '@angular/core';
import { FormConfig } from '../form-config/form-config';
import { FormState } from '../renderer/instantiate-form';

export type FormModel<F> = F extends FormConfig<infer M> ? M : never;

export type FormKeys<TForms> = keyof TForms;

export type DeferTrigger = 'idle' | 'viewport' | 'interaction';

export type InstanceOf<F> = F extends FormConfig<infer M> ? FormState<M> : never;

export type StepInstance<TForms, P> = {
  readonly [K in keyof P & keyof TForms]: InstanceOf<TForms[K]>;
};

export type SharedSignals<TShared> = { readonly [K in keyof TShared]: Signal<TShared[K]> };

export interface FlowSignals<C = unknown> {
  readonly collection: Signal<C>;

  readonly passOpen: Signal<boolean>;
}

export interface StepContext<TShared, TSteps, TParent = undefined> {
  readonly steps: TSteps;

  readonly shared: SharedSignals<TShared>;

  readonly flow?: FlowSignals;

  readonly parent: TParent;
}

export type GateContext<TShared, TSteps, TParent = undefined> = StepContext<
  TShared,
  { readonly [K in keyof TSteps]?: TSteps[K] },
  TParent
>;

export type StepCondition<TShared, TSteps, TParent = undefined> = (
  ctx: GateContext<TShared, TSteps, TParent>,
) => boolean;

export type FormLoader<M extends Record<string, unknown>> = () => Promise<FormConfig<M>>;

export type FormProvider<M extends Record<string, unknown>> = FormConfig<M> | FormLoader<M>;

export type AnyFormProvider = FormProvider<Record<string, unknown>>;

export type RuntimeStepInstance = Readonly<Record<string, unknown>>;

export interface RuntimeStepContext {
  readonly steps: Readonly<Record<string, RuntimeStepInstance | undefined>>;

  readonly shared: Readonly<Record<string, Signal<unknown>>>;

  readonly flow?: FlowSignals;

  readonly parent: RuntimeStepContext | undefined;
}

export type RuntimeStepCondition = (ctx: RuntimeStepContext) => boolean;

export type RuntimeResultResolver = (ctx: RuntimeStepContext) => unknown;

export type RuntimeFormSeed = (ctx: RuntimeStepContext) => Partial<Record<string, unknown>>;
