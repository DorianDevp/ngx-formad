import { computed, signal, Signal, WritableSignal } from '@angular/core';
import { RecurrentFlowDefinition } from '../builders/flow';
import { RuntimeStepperContext } from '../builders/step-context';

interface RingState<C> {
  readonly state: C;

  readonly passOpen: boolean;

  readonly folds: number;
}

export class FlowRing<C = unknown> {
  private readonly ring: WritableSignal<RingState<C>>;

  readonly state: Signal<C>;

  readonly passOpen: Signal<boolean>;

  readonly folds: Signal<number>;

  constructor(private readonly flow: RecurrentFlowDefinition<C>) {
    this.ring = signal(freshRing(flow));
    this.state = computed(() => this.ring().state);
    this.passOpen = computed(() => this.ring().passOpen);
    this.folds = computed(() => this.ring().folds);
  }

  fold(pass: RuntimeStepperContext): void {
    this.ring.update((ring) => ({
      state: this.flow.fold ? this.flow.fold(ring.state, pass) : ring.state,
      passOpen: false,
      folds: ring.folds + 1,
    }));
  }

  openPass(): void {
    this.ring.update((ring) => ({ ...ring, passOpen: true }));
  }

  abandonPass(): void {
    this.ring.update((ring) => ({ ...ring, passOpen: false }));
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
  const state = flow.initial();
  const reachable = flow.dockReachable ? flow.dockReachable(state) : false;

  return { state, passOpen: !reachable, folds: 0 };
}
