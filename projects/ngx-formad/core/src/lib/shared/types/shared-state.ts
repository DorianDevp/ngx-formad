import { Signal, WritableSignal } from '@angular/core';

/** What a store is seeded with, per key: a plain value the store copies into a signal of its own, or a signal of yours it keeps as the cell. */
export type StateSeeds<T extends Record<string, unknown>> = { readonly [K in keyof T]: T[K] | WritableSignal<T[K]> };

/** The values a seed record or a store's signals stand for: a signal by the value it holds. */
export type StateOf<S> = { [K in keyof S]: S[K] extends Signal<infer V> ? V : S[K] };

/** A shared store as one read-only signal per key: what a host reads, `stepper.shared.plan()`. */
export type SharedSignals<TShared extends Record<string, unknown> = Record<string, unknown>> = {
  readonly [K in keyof TShared]: Signal<TShared[K]>;
};

/** A shared store as one writable signal per key: what the stepper and what it draws write, `sharedState.plan.set(...)`. */
export type SharedState<TShared extends Record<string, unknown> = Record<string, unknown>> = {
  readonly [K in keyof TShared]: WritableSignal<TShared[K]>;
};
