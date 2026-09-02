import { SequenceNode } from '../builders/flow';
import { RuntimeStepContext } from '../builders/step-context';

/** The steps navigation walks for a context: every ungated step, plus each gated step whose `when` holds. */
export function effectiveSteps(
  steps: readonly SequenceNode[],
  ctx: RuntimeStepContext,
): readonly SequenceNode[] {
  return steps.filter((step) => !step.when || step.when(ctx));
}
