import { computed, signal, Signal, WritableSignal } from '@angular/core';
import { RecurrentFlowDefinition } from '../builders/flow';
import { RuntimeStepContext } from '../builders/step-context';

// A recurrent flow's own state, and nothing else's: the collection folded so far
// and whether a pass is open, held as ONE immutable record behind one signal.
// Every transition is a pure reducer applied through `update`, so the ring cannot
// be half-changed and there is no mutation for an outsider to reach — the
// controller asks for transitions, the fold itself stays the author's pure
// function, and readers see derived signals only.

interface RingState<C> {
  readonly collection: C;

  readonly passOpen: boolean;
}

export class FlowRing<C = unknown> {
  private readonly state: WritableSignal<RingState<C>>;

  readonly collection: Signal<C>;

  readonly passOpen: Signal<boolean>;

  constructor(private readonly flow: RecurrentFlowDefinition<C>) {
    this.state = signal(freshState(flow));
    this.collection = computed(() => this.state().collection);
    this.passOpen = computed(() => this.state().passOpen);

    // Components authored inside the flow read the collection through the port;
    // `others` equals the collection while adding (an open pass has not folded yet).
    flow.port._bind({ collection: this.collection, others: this.collection });
  }

  /** The finished pass enters the collection through the author's pure fold, and
   *  the pass closes — one atomic transition. */
  fold(pass: RuntimeStepContext): void {
    this.state.update((state) => ({
      collection: this.flow.fold ? this.flow.fold(state.collection, pass) : state.collection,
      passOpen: false,
    }));
  }

  /** A fresh pass opens; the collection is untouched. */
  openPass(): void {
    this.state.update((state) => ({ ...state, passOpen: true }));
  }

  /** Back out of a draft: the pass closes, its values are simply never folded. */
  abandonPass(): void {
    this.state.update((state) => ({ ...state, passOpen: false }));
  }

  reset(): void {
    this.state.set(freshState(this.flow));
  }

  hasAny(): boolean {
    return this.flow.hasAny(this.collection());
  }
}

// The starting point, also the reset point: a seeded collection, and a pass open
// exactly when that seed does not already satisfy the flow (an empty collection
// enters the ring at the pass's first step; a pre-filled one lands on the dock).
function freshState<C>(flow: RecurrentFlowDefinition<C>): RingState<C> {
  const collection = flow.seed();

  return { collection, passOpen: !flow.hasAny(collection) };
}
