import { signal, Signal } from '@angular/core';

// The authoring-time handle into a recurrent flow's live collection. A dock (or
// any component authored inside the flow) receives plain getters as inputs —
// `inputs: { devices: () => view.all() }` — and stays dumb: it reads data and
// emits intents, it never touches a controller. The port exists at build time so
// those closures can be authored before any runtime exists; the controller binds
// the live runtime on entry, and an unbound read reports the seed.

/** What the runtime exposes through the port. @internal */
export interface FlowPortApi<C> {
  readonly collection: Signal<C>;

  /** The collection minus the item(s) of the pass currently open — the peer set
   *  duplicate validation reads. Equals the collection while adding. */
  readonly others: Signal<C>;
}

export class FlowPort<C> {
  private readonly live = signal<FlowPortApi<C> | null>(null);

  constructor(private readonly seed: () => C) {}

  /** @internal bound by the flow's controller when it comes alive. */
  _bind(api: FlowPortApi<C>): void {
    this.live.set(api);
  }

  /** The folded collection; the seed while the flow has not run yet. Reactive —
   *  reading it inside a getter input keeps the input live. */
  all(): C {
    return this.live()?.collection() ?? this.seed();
  }

  /** The collection minus the open pass's own contribution. */
  others(): C {
    return this.live()?.others() ?? this.seed();
  }
}

/** The read-only face of a {@link FlowPort} — what authoring callbacks receive. */
export interface FlowView<C> {
  all(): C;

  others(): C;
}
