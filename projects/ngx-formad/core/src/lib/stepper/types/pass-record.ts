import { StepNode } from './nodes';

/** One named step a finished pass went through: its node, the values it committed and each form's model by name. */
export interface RecordedStep {
  readonly node: StepNode;
  readonly name: string;
  readonly values: unknown;
  readonly models: Readonly<Record<string, unknown>>;
}

/** What a finished pass went through, in order: what an entry it folded can be reopened along. */
export interface PassRecord {
  readonly steps: readonly RecordedStep[];
}

/**
 * A pass reopened for one entry of the ring's state: the entry and where it stood, the record of the pass that folded it,
 * and the furthest step Back may reach.
 */
export interface Reopening {
  readonly entry: object;
  readonly index: number;
  readonly record: PassRecord;
  readonly maxBackwardStep: StepNode;
}
