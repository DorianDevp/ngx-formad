import { Binding, InputSignal, OutputEmitterRef } from '@angular/core';

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

/**
 * A page component's bindings, as `createComponent` takes them: the array itself, or a callback over the step context,
 * read when the component is mounted - so a component on a static step binds to what earlier steps hold.
 */
export type ComponentBindings<TCtx = unknown> =
  | readonly Binding[]
  | ((ctx: TCtx) => readonly Binding[]);

/** A page component's bindings, its visibility and layout class. */
export interface ComponentCfg<TCtx = unknown> {
  readonly bindings?: ComponentBindings<TCtx>;

  readonly visibleWhen?: (ctx: TCtx) => boolean;

  readonly layout?: string;
}
