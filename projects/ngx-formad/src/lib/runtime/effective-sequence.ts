import { SequenceNode } from '../builders/flow';
import { RuntimeStepperContext } from '../builders/step-context';

/** The steps navigation walks for a context: every ungated step, plus each gated step whose `activeWhen` holds. */
export function effectiveSteps(
  steps: readonly SequenceNode[],
  ctx: RuntimeStepperContext,
): readonly SequenceNode[] {
  return steps.filter((step) => !step.activeWhen || step.activeWhen(ctx));
}
