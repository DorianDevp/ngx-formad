import { BuiltRing, RecurrentFlowDefinition } from '../types/flow';
import { RuntimeStepperContext } from '../types/step-context';
import { Stepper } from './stepper';

/** A built ring: a flow whose egress is its accumulator, plus where its dock sits and how a pass folds. */
export class RecurrentStepper<TForms = {}, TCtx extends RuntimeStepperContext = RuntimeStepperContext, C = unknown>
  extends Stepper<TForms, TCtx, C>
  implements BuiltRing<TForms, TCtx, C>
{
  readonly recurrent: true = true;

  readonly dockAt: number;

  readonly state: () => C;

  readonly fold?: (state: C, pass: RuntimeStepperContext) => C;

  readonly dockReachable?: (state: C) => boolean;

  constructor(definition: RecurrentFlowDefinition<C>) {
    super(definition);
    this.dockAt = definition.dockAt;
    this.state = definition.state;
    this.fold = definition.fold;
    this.dockReachable = definition.dockReachable;
  }
}
