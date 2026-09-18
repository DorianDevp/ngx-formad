import { Provider } from '@angular/core';
import { ControlTypeMap } from '../../controls';
import { SharedState } from '../../shared';
import { StepsCommitted } from '../types/builder';
import { BuiltFlow, FlowDefinition, SequenceNode } from '../types/flow';
import { AnyFormProvider, RuntimeStepperContext } from '../types/step-context';

/** A built linear flow or fork: the runtime shape plus the authoring types it was built with. */
export class Stepper<
  TForms = {},
  TCtx extends RuntimeStepperContext = RuntimeStepperContext,
  TResult = StepsCommitted<TCtx['steps']>,
> implements BuiltFlow<TForms, TCtx, TResult>
{
  readonly __forms?: TForms;
  readonly __context?: TCtx;
  readonly __result?: TResult;

  readonly forms: Readonly<Record<string, AnyFormProvider>>;
  readonly steps: readonly SequenceNode[];
  readonly shared: SharedState;
  readonly controlTypes: ControlTypeMap;
  readonly providers: readonly Provider[];

  readonly resolveResult?: FlowDefinition<TResult>['resolveResult'];

  constructor(definition: FlowDefinition<TResult>) {
    this.forms = definition.forms;
    this.steps = definition.steps;
    this.shared = new SharedState(definition.shared.snapshot());
    this.controlTypes = definition.controlTypes;
    this.providers = definition.providers;
    this.resolveResult = definition.resolveResult;
  }
}
