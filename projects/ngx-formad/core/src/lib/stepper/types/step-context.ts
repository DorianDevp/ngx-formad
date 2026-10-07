import { Signal } from '@angular/core';
import { FormConfig, FormModelSource, FormState, RuntimeFormConfig } from '../../form';
import { SharedSignals } from '../../shared';

/** The config a pool entry resolves to: itself, or what its loader yields. */
export type ConfigOf<F> = F extends () => Promise<infer C> ? C : F;

/** The model type of a pooled form template. */
export type FormModel<F> = ConfigOf<F> extends { readonly model: FormModelSource<infer M extends Record<string, unknown>> }
  ? M
  : never;

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
 * An instance the built stepper does not build with itself - a loader's, or one of a step built on entry - but once its
 * step brings it to life. The mark is the type system's alone; at runtime it is the plain instance.
 */
export type BuiltOnEntry<T> = T & { readonly __builtOnEntry: true };

/**
 * One step's live instances by name, for the forms `P` the step placed: each typed by the template placed there —
 * the pool entry it named, or the config given at the page. `OnEntry` says whether the step builds its pages on entry.
 */
export type StepInstance<P, OnEntry extends boolean = false> = {
  readonly [K in keyof P]: [OnEntry] extends [true]
    ? BuiltOnEntry<InstanceOf<P[K]>>
    : P[K] extends (...args: never[]) => unknown
      ? BuiltOnEntry<InstanceOf<P[K]>>
      : InstanceOf<P[K]>;
};

/**
 * The built stepper's named steps, each with its forms: an instance built with the stepper as it is, one built on entry
 * as a signal holding it once it exists. A nested flow's or a ring's slot holds an egress, not instances, and is left out.
 */
export type BuiltSteps<TSteps> = {
  readonly [K in keyof TSteps as NonNullable<TSteps[K]> extends Readonly<Record<string, FormState>> ? K : never]: {
    readonly forms: {
      readonly [F in keyof NonNullable<TSteps[K]>]: NonNullable<TSteps[K]>[F] extends BuiltOnEntry<FormState<infer M>>
        ? Signal<FormState<M> | null>
        : NonNullable<TSteps[K]>[F];
    };
  };
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
export type WithShared<TCtx extends RuntimeStepperContext, S extends Record<string, unknown>> = TCtx & {
  readonly shared: SharedSignals<S>;
};

/** The context with a step entry added, as an intersection; what a step's own options read while it is authored. */
export type WithSteps<TCtx extends RuntimeStepperContext, E> = TCtx & {
  readonly steps: E;
};

/** The context the chain continues with once entries are added: the same level, its steps flattened for readable hovers. */
export type AfterSteps<TCtx extends RuntimeStepperContext, E> = StepperContext<
  TCtx['shared'],
  { readonly [K in keyof (TCtx['steps'] & E)]: (TCtx['steps'] & E)[K] },
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
