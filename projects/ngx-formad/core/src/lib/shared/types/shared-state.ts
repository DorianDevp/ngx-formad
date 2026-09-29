import { WritableSignal } from '@angular/core';

/** What a store is seeded with, per key: a plain value the store copies into a signal of its own, or a signal of yours it keeps as the cell. */
export type StateSeeds<T extends Record<string, unknown>> = { readonly [K in keyof T]: T[K] | WritableSignal<T[K]> };

/** The values a seed record stands for: a signal by the value it holds. */
export type StateOf<S> = { [K in keyof S]: S[K] extends WritableSignal<infer V> ? V : S[K] };
