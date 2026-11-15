import { computed, DestroyRef, EnvironmentInjector, inject, Injector, Provider, Signal } from '@angular/core';
import { SharedSignals, StateOf } from '../../shared';
import { FormadFlowInstance } from '../runtime/flow-instance';
import { FormadWizard } from '../runtime/wizard-context';
import { StepsCommitted } from '../types/builder';
import { BuiltFlow, RuntimeFlow } from '../types/flow';
import { FlowInstance } from '../types/flow-instance';
import { BuiltSteps, RuntimeStepperContext } from '../types/step-context';

/**
 * A built linear flow or fork: its shared store as read-only signals, its named steps' forms, and the instances behind
 * them. Built in an injection context, which owns it: every eager form is built here, and goes when that context is
 * destroyed.
 */
export class Stepper<
  TForms = {},
  TCtx extends RuntimeStepperContext = RuntimeStepperContext,
  TResult = StepsCommitted<TCtx['steps']>,
> implements BuiltFlow<TForms, TCtx, TResult>
{
  readonly __forms?: TForms;
  readonly __context?: TCtx;
  readonly __result?: TResult;

  /** The shared store, one read-only signal per `withState` key; the stepper and what it draws write it. */
  readonly shared: SharedSignals<StateOf<TCtx['shared']>>;

  /** The named steps' forms: an eager one is its instance, a lazy one (or one of a step built on entry) a signal of it. */
  readonly steps: BuiltSteps<TCtx['steps']>;

  readonly instance: FlowInstance<TResult>;

  /**
   * What the stepper hands out, as `(completed)` emits it: the committed steps, a fork's chosen arm, or what the tip it
   * ended in maps to. `null` until a `<ngx-formad-stepper>` draws it and the flow stands on its last step.
   */
  readonly result: Signal<TResult | null>;

  constructor(flow: RuntimeFlow<TResult>) {
    const wizard: Provider = { provide: FormadWizard, useFactory: () => new FormadWizard(this) };
    const instance = new FormadFlowInstance(flow, { injector: inject(Injector), environment: inject(EnvironmentInjector) }, [
      wizard,
    ]);
    inject(DestroyRef).onDestroy(() => instance.destroy());
    this.instance = instance;

    const shared: Record<string, Signal<unknown>> = {};
    for (const [key, cell] of Object.entries(instance.sharedState)) shared[key] = cell.asReadonly();
    // The flow is erased; the context it was authored over says which keys the store and the steps hold.
    this.shared = shared as SharedSignals<StateOf<TCtx['shared']>>;
    this.steps = instance.steps as BuiltSteps<TCtx['steps']>;

    const drawing = instance.environment.get(FormadWizard).controller;
    this.result = computed(() => (drawing()?.result() as TResult | null | undefined) ?? null);
  }
}
