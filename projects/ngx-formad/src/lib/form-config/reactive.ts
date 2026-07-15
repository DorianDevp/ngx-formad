import { computed, isSignal, Signal } from '@angular/core';
import {
  RepeatingGroupNode,
  UiFormControlNode,
  UiFormGroupConfig,
  UiFormGroupNode,
} from 'formodel';

// formodel stays framework-agnostic: its nodes carry plain values. This module is
// the reactive layer on top — any *presentational* prop of a control node (select
// options, a label, a placeholder…) may be authored as a `Signal` instead of a
// value, and the renderer reads it live. That is what makes "seed the select after
// instantiating the form" work: hand the config a signal, instantiate, then set
// the signal whenever the data arrives. Nothing re-instantiates; only the control's
// input bindings — which unwrap through `readReactive` — see the new value.
//
// Structural props stay static on purpose: `type` is the control discriminant,
// and group/array shape (`controlsConfig`, `itemConfig`, group labels) is walked
// once by `buildNodes`. A form whose *fields* change at runtime is a different
// feature (rebuilding the render tree), not a prop binding.

/** A config value that may be live: the plain value formodel declares, or a
 *  signal of it. The renderer reads either through {@link readReactive}. */
export type ReactiveValue<T> = T | Signal<T>;

/** Reads a maybe-reactive config value: unwraps a signal, passes a value through.
 *  Called inside input bindings, so a signal read here keeps the binding live. */
export function readReactive<T>(value: ReactiveValue<T>): T {
  return isSignal(value) ? (value as Signal<T>)() : (value as T);
}

/** Derives from a maybe-reactive value without losing its liveness: a signal maps
 *  to a `computed` (stable identity between emissions — downstream `Object.is`
 *  checks don't churn), a plain value maps once. */
export function mapReactive<T, R>(value: ReactiveValue<T>, fn: (value: T) => R): ReactiveValue<R> {
  return isSignal(value) ? computed(() => fn((value as Signal<T>)())) : fn(value as T);
}

/**
 * Widens a signal to the plain value formodel's builder helpers expect, so a live
 * prop can flow through the fluent chain: `select('Country', reactive(countries))`.
 *
 * formodel's types are framework-agnostic and know nothing of signals; the renderer
 * unwraps whatever actually arrives. Like `asRenderable`/`asStepper`, this is the
 * single named widening point — prefer it over a raw cast at the call site. Configs
 * authored as literals don't need it: `FormConfig.ui` accepts signals directly.
 */
export function reactive<T>(value: Signal<T>): T {
  return value as unknown as T;
}

/** A formodel control node with every presentational prop widened to accept a
 *  signal. The `type` discriminant stays plain, so `switch (node.type)` narrows
 *  exactly as it does on the original union. */
export type ReactiveControlNode<N extends UiFormControlNode = UiFormControlNode> =
  N extends UiFormControlNode
    ? { [K in keyof N]: K extends 'type' ? N[K] : ReactiveValue<N[K]> }
    : never;

// One value of the group config: groups and repeating arrays keep their structure
// (recursing into their children), scalar controls widen. Distributes over the
// node unions, so array-typed keys (repeating group | select | file) resolve
// member by member.
type ReactiveUiNode<V> = V extends UiFormGroupNode<infer T>
  ? Omit<V, 'controlsConfig'> & { readonly controlsConfig: ReactiveUiConfig<T> }
  : V extends RepeatingGroupNode<infer U>
    ? Omit<V, 'itemConfig'> & { readonly itemConfig: ReactiveUiConfig<U> }
    : V extends UiFormControlNode
      ? ReactiveControlNode<V>
      : V;

/** `UiFormGroupConfig<M>` with control props widened to {@link ReactiveValue}.
 *  Every plain formodel config is assignable to it, so builder-authored configs
 *  keep working unchanged; literal-authored configs may put signals in directly. */
export type ReactiveUiConfig<M> = {
  [K in keyof UiFormGroupConfig<M>]: ReactiveUiNode<UiFormGroupConfig<M>[K]>;
};
