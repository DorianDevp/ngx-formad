import { BuiltRing, RecurrentFlowDefinition } from '../types/flow';
import { RuntimeStepperContext } from '../types/step-context';
import { Stepper } from './stepper';

/** A built ring: a flow whose egress is its accumulator; where its dock sits and how a pass folds stay in its flow. */
export class RecurrentStepper<TForms = {}, TCtx extends RuntimeStepperContext = RuntimeStepperContext, C = unknown>
  extends Stepper<TForms, TCtx, C>
  implements BuiltRing<TForms, TCtx, C>
{
  declare readonly __recurrent: true;

  constructor(definition: RecurrentFlowDefinition<C>) {
    super(definition);
  }
}
