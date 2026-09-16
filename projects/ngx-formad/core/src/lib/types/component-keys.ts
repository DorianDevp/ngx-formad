import { InputSignal, ModelSignal, OutputEmitterRef } from '@angular/core';

/** The keys of `C` that are signal inputs. */
export type InputKeys<C> = {
  [K in keyof C]: C[K] extends InputSignal<infer _V> ? K : never;
}[keyof C];

/** The keys of `C` that are output emitters. */
export type OutputKeys<C> = {
  [K in keyof C]: C[K] extends OutputEmitterRef<infer _V> ? K : never;
}[keyof C];

/** The keys of `C` that are model signals. */
export type ModelKeys<C> = {
  [K in keyof C]: C[K] extends ModelSignal<infer _V> ? K : never;
}[keyof C];

/** The value type of input `K` of `C`. */
export type InputVal<C, K extends keyof C> = C[K] extends InputSignal<infer V> ? V : never;

/** The event type of output `K` of `C`. */
export type OutputVal<C, K extends keyof C> = C[K] extends OutputEmitterRef<infer V> ? V : never;

/** The value type of model `K` of `C`. */
export type ModelVal<C, K extends keyof C> = C[K] extends ModelSignal<infer V> ? V : never;
