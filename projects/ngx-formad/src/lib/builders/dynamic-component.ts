import { Binding, InputSignal, inputBinding, OutputEmitterRef, outputBinding } from '@angular/core';

// A dynamic component is one the config drops into a page on some condition and
// wires into the surrounding state. `NgComponentOutlet` cannot do this — it has
// no output binding and no reactive inputs — so we render through the
// `createComponent` bindings API, and these types make the config for it typed:
// only real `@Input`/`@Output` names are accepted, with their value types.

/** A value that may be constant, a getter, or a signal. Normalized at the edge. */
export type Reactive<V> = V | (() => V);

/** Keys of C that are signal inputs. */
export type InputKeys<C> = {
  [K in keyof C]: C[K] extends InputSignal<unknown> ? K : never;
}[keyof C];

/** Keys of C that are output emitters. */
export type OutputKeys<C> = {
  [K in keyof C]: C[K] extends OutputEmitterRef<unknown> ? K : never;
}[keyof C];

/** The value type of an input key. */
export type InputVal<C, K extends keyof C> = C[K] extends InputSignal<infer V> ? V : never;

/** The event type of an output key. */
export type OutputVal<C, K extends keyof C> = C[K] extends OutputEmitterRef<infer V> ? V : never;

/** Reactive inputs and event handlers for one dynamic component, plus visibility. */
export interface ComponentCfg<C> {
  readonly inputs?: { [K in InputKeys<C>]?: Reactive<InputVal<C, K>> };
  readonly outputs?: { [K in OutputKeys<C>]?: (event: OutputVal<C, K>) => void };
  /** The renderer auto-`@if`-gates the component on this. */
  readonly visibleWhen?: () => boolean;
  /** Layout classes for this component's slot. */
  readonly layout?: string;
}

/** Wraps a plain value as a getter; passes a getter through untouched. */
export function toGetter<V>(value: Reactive<V>): () => V {
  return typeof value === 'function' ? (value as () => V) : () => value;
}

/**
 * Normalizes a component config into the `Binding[]` `createComponent` wants.
 * Static values become getters so the binding side never has to special-case
 * them — the one normalization boundary between authoring and rendering.
 */
export function toBindings<C>(cfg: ComponentCfg<C>): Binding[] {
  const inputs = Object.entries(cfg.inputs ?? {}).map(([name, value]) =>
    inputBinding(name, toGetter(value as Reactive<unknown>)),
  );
  const outputs = Object.entries(cfg.outputs ?? {}).map(([name, handler]) =>
    outputBinding(name, handler as (event: unknown) => void),
  );
  return [...inputs, ...outputs];
}
