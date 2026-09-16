import { isFlowStep } from '../builder/flow';
import { SequenceNode } from '../types/flow';
import { LiveStep } from '../types/live-step';
import { StepNode } from '../types/nodes';

/** The live steps of a flow, by their node. */
export type StepMemo = ReadonlyMap<StepNode, LiveStep>;

/**
 * Where a flow's navigation stands: the node the cursor rests on, whether Next was refused there, the steps brought
 * to life so far, and the one seeded last. Immutable: every change hands back a new `Navigation`, so the controller
 * has exactly one thing to write and every reader sees a whole, consistent state.
 */
export class Navigation {
  static readonly start = new Navigation(null, false, new Map(), null);

  private constructor(
    readonly cursor: SequenceNode | null,
    readonly attemptedNext: boolean,
    readonly memo: StepMemo,
    readonly shown: StepNode | null,
  ) {}

  stepOf(node: StepNode): LiveStep | undefined {
    return this.memo.get(node);
  }

  /** The step the cursor lands on: itself when effective, else the closest effective step before it, else the first. */
  landing(effective: readonly SequenceNode[], steps: readonly SequenceNode[]): SequenceNode | null {
    const cursor = this.cursor;
    if (!cursor) return effective[0] ?? null;
    if (effective.includes(cursor)) return cursor;

    const origin = steps.indexOf(cursor);
    let target: SequenceNode | undefined;
    for (const candidate of effective) {
      if (steps.indexOf(candidate) <= origin) target = candidate;
      else break;
    }

    return target ?? effective[0] ?? null;
  }

  movedTo(cursor: SequenceNode): Navigation {
    return new Navigation(cursor, false, this.memo, this.shown);
  }

  attempted(): Navigation {
    return this.attemptedNext ? this : new Navigation(this.cursor, true, this.memo, this.shown);
  }

  /** With a step brought to life; it counts as shown. */
  withStep(node: StepNode, live: LiveStep): Navigation {
    return new Navigation(this.cursor, this.attemptedNext, new Map(this.memo).set(node, live), node);
  }

  shownAs(node: StepNode): Navigation {
    return this.shown === node ? this : new Navigation(this.cursor, this.attemptedNext, this.memo, node);
  }

  /** Without the given steps; a flow step keeps no entry here, its child owns its own. A forgotten step is no longer shown. */
  forgetting(nodes: readonly SequenceNode[]): Navigation {
    const memo = new Map(this.memo);
    for (const node of nodes) {
      if (!isFlowStep(node)) memo.delete(node);
    }
    const shown = this.shown !== null && nodes.includes(this.shown) ? null : this.shown;

    return new Navigation(this.cursor, this.attemptedNext, memo, shown);
  }
}
