import { RuntimeStepperContext, StepCondition } from '../types/step-context';

/** A step gate with a name: the steps it gates run, or are skipped, together. */
export type NamedGate<G extends string, TCtx extends RuntimeStepperContext = RuntimeStepperContext> = StepCondition<TCtx> & {
  readonly __gate: G;
};

/**
 * A gate several steps share, by name: `activeWhen` takes it as any condition, and a fork's tip context holds the
 * steps it gates all together or none of them, one variant per gate rather than per step.
 */
export function gate<G extends string, TCtx extends RuntimeStepperContext = RuntimeStepperContext>(
  name: G,
  when: StepCondition<TCtx>,
): NamedGate<G, TCtx> {
  return Object.assign((ctx: TCtx) => when(ctx), { __gate: name });
}
