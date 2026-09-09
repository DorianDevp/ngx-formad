import { signal, Signal, WritableSignal } from '@angular/core';

const STRUCTURED_CLONE = typeof structuredClone === 'function';

/**
 * Copies a stored value so the store hands out its own: the platform's `structuredClone` where it exists, a
 * structural walk otherwise, since a test environment (jsdom under Jest) may not provide it.
 */
function clone<V>(value: V): V {
  if (STRUCTURED_CLONE) return structuredClone(value);
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry) => clone(entry)) as V;
  if (value instanceof Date) return new Date(value.getTime()) as V;
  if (value instanceof Map) return new Map([...value].map(([key, entry]) => [clone(key), clone(entry)])) as V;
  if (value instanceof Set) return new Set([...value].map((entry) => clone(entry))) as V;

  const copy: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) copy[key] = clone(entry);

  return copy as V;
}

/** The cross-step shared store: one writable signal per key, read through `select`, `get` and `signals`. */
export class SharedState<T extends Record<string, unknown> = Record<string, unknown>> {
  private readonly cells = new Map<string, WritableSignal<T[string]>>();

  private readonly initial: T;

  constructor(initial: T) {
    this.initial = clone(initial);
    for (const key in initial) this.cells.set(key, signal(clone(initial[key])));
  }

  reset(): void {
    const fresh = clone(this.initial);
    for (const key in fresh) this.cell(key).set(fresh[key]);
  }

  select(key: string): Signal<T[string]> {
    return this.cell(key).asReadonly();
  }

  get(key: string): T[string] {
    return this.cell(key)();
  }

  signals(): Readonly<Record<string, Signal<T[string]>>> {
    const view: Record<string, Signal<T[string]>> = {};
    for (const [key, cell] of this.cells) view[key] = cell.asReadonly();

    return view;
  }

  snapshot(): Readonly<Record<string, T[string]>> {
    const values: Record<string, T[string]> = {};
    for (const [key, cell] of this.cells) values[key] = cell();

    return values;
  }

  patch(partial: Partial<T>): void {
    for (const key in partial) {
      const value = partial[key];
      if (value !== undefined) this.cell(key).set(value);
    }
  }

  private cell(key: string): WritableSignal<T[string]> {
    const cell = this.cells.get(key);
    if (!cell) throw new Error(`ngx-formad: shared state has no key "${key}".`);

    return cell;
  }
}
