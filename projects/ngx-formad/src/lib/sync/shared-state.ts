import { signal, Signal, WritableSignal } from '@angular/core';
import { SharedSlot } from './directional-sync';

// The cross-step shared store. Each key becomes its own writable signal so a
// single field can bind to a single slot, and so reads stay fine-grained. This
// follows the `signalState` / `patchState` idiom but on plain Angular signals —
// the suite's only runtime dependency is formodel, not @ngrx.
export class SharedState<S extends Record<string, unknown>> {
  private readonly cells: { readonly [K in keyof S]: WritableSignal<S[K]> };
  // A deep copy of the initial values, so `reset()` can restore them even after
  // nested objects in the store have been mutated.
  private readonly initial: S;

  constructor(initial: S) {
    this.initial = copy(initial);
    const cells = {} as { [K in keyof S]: WritableSignal<S[K]> };
    for (const key of Object.keys(initial) as (keyof S)[]) {
      cells[key] = signal(copy(initial[key]));
    }
    this.cells = cells;
  }

  /** Restores every key to the value the store was constructed with — the
   *  cross-step half of a wizard restart (`StepperController.reset()`). */
  reset(): void {
    const fresh = copy(this.initial);
    for (const key of Object.keys(this.cells) as (keyof S)[]) {
      this.cells[key].set(fresh[key]);
    }
  }

  /** One key as a read-only signal, for templates and computed reads. */
  select<K extends keyof S>(key: K): Signal<S[K]> {
    return this.cells[key].asReadonly();
  }

  /** The current value of one key, without subscribing. */
  get<K extends keyof S>(key: K): S[K] {
    return this.cells[key]();
  }

  /** A reactive snapshot of every key as a plain object. Reading it subscribes to
   *  all cells, so a `computed` that calls this re-runs on any change — the read
   *  side a step condition needs: typed as `S`, safe for unknown-key access. */
  snapshot(): S {
    const out = {} as S;
    for (const key of Object.keys(this.cells) as (keyof S)[]) out[key] = this.cells[key]();
    return out;
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

// `structuredClone` is the right deep copy for the plain data shared state is meant
// to hold - but a consumer's `withState` may carry a function, a signal or a class
// instance, and then it throws `DataCloneError` from inside the constructor, which
// reads as "the wizard is broken" rather than "this value cannot be deep-copied".
// A shallow copy is the honest fallback: mutation of a nested object survives a
// `reset()`, which is a documented limit, not a crash.
function copy<V>(value: V): V {
  try {
    return structuredClone(value);
  } catch {
    if (Array.isArray(value)) return [...value] as V;
    if (value && typeof value === 'object') return { ...value } as V;
    return value;
  }
}
