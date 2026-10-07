import { computed, signal, Signal, WritableSignal } from '@angular/core';
import { RecurrentFlowDefinition } from '../types/flow';
import { PassRecord, Reopening } from '../types/pass-record';
import { RuntimeStepperContext } from '../types/step-context';

interface RingState<C> {
  readonly state: C;

  readonly passOpen: boolean;

  readonly folds: number;

  /** The pass that folded each entry of an array state, by the entry itself. */
  readonly records: ReadonlyMap<object, PassRecord>;

  readonly reopening: Reopening | null;
}

export class FlowRing<C = unknown> {
  private readonly ring: WritableSignal<RingState<C>>;

  /** The accumulator as it is, the entry being reopened included. */
  readonly entries: Signal<C>;

  /** The accumulator as the pass sees it: while a pass is reopened for an entry, without that entry. */
  readonly state: Signal<C>;

  readonly passOpen: Signal<boolean>;

  readonly folds: Signal<number>;

  readonly reopening: Signal<Reopening | null>;

  constructor(private readonly flow: RecurrentFlowDefinition<C>) {
    this.ring = signal(freshRing(flow));
    this.entries = computed(() => this.ring().state);
    this.state = computed(() => {
      const { state, reopening } = this.ring();

      return reopening && Array.isArray(state) ? (state.filter((entry) => entry !== reopening.entry) as C) : state;
    });
    this.passOpen = computed(() => this.ring().passOpen);
    this.folds = computed(() => this.ring().folds);
    this.reopening = computed(() => this.ring().reopening);
  }

  /**
   * Folds a finished pass into the state and records it for every entry it added. A reopened pass is folded over the
   * state without its entry, and what it adds takes the entry's place.
   */
  fold(pass: RuntimeStepperContext, record: PassRecord): void {
    this.ring.update((ring) => {
      const reopening = ring.reopening;
      const base = reopening && Array.isArray(ring.state) ? (ring.state.filter((entry) => entry !== reopening.entry) as C) : ring.state;
      const folded = this.flow.fold ? this.flow.fold(base, pass) : base;
      if (!Array.isArray(folded) || !Array.isArray(base)) {
        return { ...ring, state: folded, passOpen: false, folds: ring.folds + 1, reopening: null };
      }

      const added = folded.filter((entry) => !base.includes(entry));
      const state = reopening ? folded.filter((entry) => !added.includes(entry)) : [...folded];
      if (reopening) state.splice(reopening.index, 0, ...added);

      const records = new Map(ring.records);
      if (reopening) records.delete(reopening.entry);
      for (const entry of added) if (typeof entry === 'object' && entry !== null) records.set(entry, record);

      return { state: state as C, passOpen: false, folds: ring.folds + 1, records, reopening: null };
    });
  }

  openPass(): void {
    this.ring.update((ring) => ({ ...ring, passOpen: true, reopening: null }));
  }

  /** Opens a pass for one entry again; until it folds, the state the pass sees leaves the entry out. */
  reopen(reopening: Reopening): void {
    this.ring.update((ring) => ({ ...ring, passOpen: true, reopening }));
  }

  abandonPass(): void {
    this.ring.update((ring) => ({ ...ring, passOpen: false, reopening: null }));
  }

  /** The state as the dock amends it; no pass opens or folds, `dockReachable` reads the new state. */
  amend(update: (state: C) => C): void {
    this.ring.update((ring) => {
      const state = update(ring.state);
      if (!Array.isArray(state)) return { ...ring, state };

      const records = new Map([...ring.records].filter(([entry]) => state.includes(entry)));

      return { ...ring, state, records };
    });
  }

  recordOf(entry: object): PassRecord | undefined {
    return this.ring().records.get(entry);
  }

  reset(): void {
    this.ring.set(freshRing(this.flow));
  }

  dockReachable(): boolean {
    const reachable = this.flow.dockReachable;

    return reachable ? reachable(this.state()) : this.folds() > 0;
  }
}

function freshRing<C>(flow: RecurrentFlowDefinition<C>): RingState<C> {
  const state = flow.state();
  const reachable = flow.dockReachable ? flow.dockReachable(state) : false;

  return { state, passOpen: !reachable, folds: 0, records: new Map(), reopening: null };
}
