import { SequenceNode } from '../builders/flow';
import { RuntimeStepContext } from '../builders/step-context';

// The conditional-navigation primitive, kept pure so it is trivially testable and
// reusable by a custom host. A step with no `when` is always present; one with a
// `when` is included only while it returns true for the given context. The result
// is the ordered sequence navigation walks — hidden steps simply are not in it,
// and steps after them rejoin automatically.
export function effectiveSteps(
  steps: readonly SequenceNode[],
  ctx: RuntimeStepContext,
): readonly SequenceNode[] {
  return steps.filter((step) => !step.when || step.when(ctx));
}
