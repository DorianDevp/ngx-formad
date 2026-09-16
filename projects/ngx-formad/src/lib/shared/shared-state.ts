import { InjectionToken, signal, Signal, WritableSignal } from '@angular/core';

const STRUCTURED_CLONE = typeof structuredClone === 'function';

/**
 * Copies a stored value so the store hands out its own: the platform's `structuredClone` where it exists, a
 * structural walk where it does not (an older browser, a bare jsdom). The walk remembers what it has copied, so a
 * cycle comes out as one shape rather than a stack overflow, but it is a best effort and not `structuredClone`'s
 * equal: a `Date` reached twice becomes two dates, and a `RegExp`, a typed array or an `Error` loses what is not an
 * own enumerable property. Keep shared state plain and this never matters.
 */
function clone<V>(value: V, seen: WeakMap<object, unknown> = new WeakMap()): V {
  if (STRUCTURED_CLONE) return structuredClone(value);
  if (value === null || typeof value !== 'object') return value;

  const already = seen.get(value);
  if (already !== undefined) return already as V;

  if (value instanceof Date) return new Date(value.getTime()) as V;
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const entry of value) copy.push(clone(entry, seen));

    return copy as V;
  }
  if (value instanceof Map) {
    const copy = new Map();
    seen.set(value, copy);
    for (const [key, entry] of value) copy.set(clone(key, seen), clone(entry, seen));

    return copy as V;
  }
  if (value instanceof Set) {
    const copy = new Set();
    seen.set(value, copy);
    for (const entry of value) copy.add(clone(entry, seen));

    return copy as V;
  }

  const copy: Record<string, unknown> = {};
  seen.set(value, copy);
  for (const [key, entry] of Object.entries(value)) copy[key] = clone(entry, seen);

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

/**
 * The store of the enclosing stepper, for a form instantiated inside one without being handed a store of its own;
 * `null` where no stepper provides it.
 */
export const SHARED_STATE = new InjectionToken<SharedState | null>('ngx-formad.shared-state');
