import { signal, Signal, WritableSignal } from '@angular/core';
import { ErasedRecord } from '../builders/step-context';
import { SharedSlot } from './directional-sync';

function copy<V>(value: V): V {
  try {
    return structuredClone(value);
  } catch {
    if (Array.isArray(value)) return [...value] as V;
    if (value && typeof value === 'object') return { ...value } as V;

    return value;
  }
}

/** The cross-step shared store: one writable signal per key, with `select`, `get`, `snapshot`, `patch`, `slot` and `reset`. */
export class SharedState<S extends ErasedRecord> {
  private readonly cells: { readonly [K in keyof S]: WritableSignal<S[K]> };

  private readonly initial: S;

  constructor(initial: S) {
    this.initial = copy(initial);
    const keys = Object.keys(initial) as (keyof S)[];
    this.cells = Object.fromEntries(keys.map((key) => [key, signal(copy(initial[key]))])) as {
      readonly [K in keyof S]: WritableSignal<S[K]>;
    };
  }

  reset(): void {
    const fresh = copy(this.initial);
    for (const key of Object.keys(this.cells) as (keyof S)[]) {
      this.cells[key].set(fresh[key]);
    }
  }

  select<K extends keyof S>(key: K): Signal<S[K]> {
    return this.cells[key].asReadonly();
  }

  get<K extends keyof S>(key: K): S[K] {
    return this.cells[key]();
  }

  snapshot(): S {
    const keys = Object.keys(this.cells) as (keyof S)[];

    return Object.fromEntries(keys.map((key) => [key, this.cells[key]()])) as S;
  }

  patch(partial: Partial<S>): void {
    for (const key of Object.keys(partial) as (keyof S)[]) {
      const value = partial[key];
      if (value !== undefined) this.cells[key].set(value);
    }
  }

  slot<K extends keyof S>(key: K): SharedSlot<S[K]> {
    const cell = this.cells[key];

    return { read: () => cell(), write: (value) => cell.set(value) };
  }
}
