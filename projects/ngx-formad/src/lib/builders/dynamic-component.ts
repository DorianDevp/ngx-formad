import { Binding, InputSignal, inputBinding, OutputEmitterRef, outputBinding } from '@angular/core';
import { ErasedValue } from './step-context';

/** A value that may be constant or a getter; normalized at the rendering edge. */
export type Reactive<V> = V | (() => V);

/** The keys of `C` that are signal inputs. */
export type InputKeys<C> = {
  [K in keyof C]: C[K] extends InputSignal<infer _V> ? K : never;
}[keyof C];

/** The keys of `C` that are output emitters. */
export type OutputKeys<C> = {
  [K in keyof C]: C[K] extends OutputEmitterRef<infer _V> ? K : never;
}[keyof C];

/** The value type of input `K` of `C`. */
export type InputVal<C, K extends keyof C> = C[K] extends InputSignal<infer V> ? V : never;

/** The event type of output `K` of `C`. */
export type OutputVal<C, K extends keyof C> = C[K] extends OutputEmitterRef<infer V> ? V : never;

/** Reactive inputs, output handlers, visibility and layout class for one dynamic component. */
export interface ComponentCfg<C> {
  readonly inputs?: { [K in InputKeys<C>]?: Reactive<InputVal<C, K>> };

  readonly outputs?: { [K in OutputKeys<C>]?: (event: OutputVal<C, K>) => void };

  readonly visibleWhen?: () => boolean;

  readonly layout?: string;
}

/** Wraps a constant as a getter; passes a getter through. */
export function toGetter<V>(value: Reactive<V>): () => V {
  return typeof value === 'function' ? (value as () => V) : () => value;
}

/** Normalizes a component config into the bindings `createComponent` takes. */
export function toBindings<C>(cfg: ComponentCfg<C>): Binding[] {
  const inputs: Readonly<Partial<Record<string, Reactive<ErasedValue>>>> = cfg.inputs ?? {};
  const outputs: Readonly<Partial<Record<string, (event: never) => void>>> = cfg.outputs ?? {};

  return [
    ...Object.entries(inputs).map(([name, value]) => inputBinding(name, toGetter(value))),
    ...Object.entries(outputs).flatMap(([name, handler]) => (handler ? [outputBinding(name, handler)] : [])),
  ];
}
