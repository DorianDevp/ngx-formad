import { SequenceNode } from '../types/flow';
import { RuntimeStepperContext } from '../types/step-context';

/**
 * The steps navigation walks for a context, decided in order up to the front.
 *
 * An ungated step is always listed. A gated step is asked only while every step listed before it has been
 * entered (`entered`) or skipped by its own gate — so a gate always finds the predecessors its type promises. The
 * first listed step not yet entered closes the front: gated steps after it stay undecided, their gates unasked,
 * until navigation reaches them. Ungated steps beyond the front are still listed; no decision is pending on them.
 *
 * One walk, one context: every gate is handed the same context object, so a branch's arms share one decision.
 */
export function effectiveSteps(
  steps: readonly SequenceNode[],
  ctx: RuntimeStepperContext,
  entered: (step: SequenceNode) => boolean,
): readonly SequenceNode[] {
  const walk: RuntimeStepperContext = { ...ctx };
  const effective: SequenceNode[] = [];
  let settled = true;
  for (const step of steps) {
    if (step.activeWhen) {
      if (!settled) continue;
      if (!step.activeWhen(walk)) continue;
    }
    effective.push(step);
    settled &&= entered(step);
  }

  return effective;
}
