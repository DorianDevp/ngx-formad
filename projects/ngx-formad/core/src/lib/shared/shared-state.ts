import { isSignal, signal, WritableSignal } from '@angular/core';
import { SharedState, StateSeeds } from './types/shared-state';

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

/**
 * The shared store a seed record stands for: one writable signal per key, `sharedState.plan`. A key seeded with a
 * signal of yours has that signal as its cell; any other gets a signal of its own over a copy of the seed.
 */
export function createSharedState<T extends Record<string, unknown>>(seeds: StateSeeds<T>): SharedState<T> {
  const state: Record<string, WritableSignal<unknown>> = {};
  for (const key in seeds) {
    const seed: unknown = seeds[key];
    // `isSignal` knows a signal, not a writable one; `StateSeeds` let only a writable one in.
    state[key] = isSignal(seed) ? (seed as WritableSignal<unknown>) : signal(clone(seed));
  }

  // Built key by key from `seeds`, which `StateSeeds<T>` keys exactly as `T`.
  return state as SharedState<T>;
}

/** Puts every key the store made a signal for back to a copy of its seed; a signal of yours stays as it is, the author owns it. */
export function resetSharedState<T extends Record<string, unknown>>(state: SharedState<T>, seeds: StateSeeds<T>): void {
  const cells: Readonly<Record<string, WritableSignal<unknown>>> = state;
  for (const key in seeds) {
    const seed: unknown = seeds[key];
    if (!isSignal(seed)) cells[key].set(clone(seed));
  }
}
