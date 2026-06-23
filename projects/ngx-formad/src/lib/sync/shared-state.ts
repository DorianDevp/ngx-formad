import { signal, Signal, WritableSignal } from '@angular/core';
import { SharedSlot } from './directional-sync';

// The cross-step shared store. Each key becomes its own writable signal so a
// single field can bind to a single slot, and so reads stay fine-grained. This
// follows the `signalState` / `patchState` idiom but on plain Angular signals —
// the suite's only runtime dependency is formodel, not @ngrx.
export class SharedState<S extends Record<string, unknown>> {
  private readonly cells: { readonly [K in keyof S]: WritableSignal<S[K]> };

  constructor(initial: S) {
    const cells = {} as { [K in keyof S]: WritableSignal<S[K]> };
    for (const key of Object.keys(initial) as (keyof S)[]) {
      cells[key] = signal(initial[key]);
    }
    this.cells = cells;
  }

  /** One key as a read-only signal, for templates and computed reads. */
  select<K extends keyof S>(key: K): Signal<S[K]> {
    return this.cells[key].asReadonly();
  }

  /** The current value of one key, without subscribing. */
  get<K extends keyof S>(key: K): S[K] {
    return this.cells[key]();
  }

  /** Merge a partial update. Keys left out (or undefined) are untouched. */
  patch(partial: Partial<S>): void {
    for (const key of Object.keys(partial) as (keyof S)[]) {
      const value = partial[key];
      if (value !== undefined) this.cells[key].set(value as S[keyof S]);
    }
  }

  /** A read/write slot for one key, handed to the directional sync engine. */
  slot<K extends keyof S>(key: K): SharedSlot<S[K]> {
    const cell = this.cells[key];
    return { read: () => cell(), write: (value) => cell.set(value) };
  }
}
