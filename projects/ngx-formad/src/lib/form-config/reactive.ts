import { computed, isSignal, Signal } from '@angular/core';
import {
  RepeatingGroupNode,
  UiFormControlNode,
  UiFormGroupConfig,
  UiFormGroupNode,
} from 'formodel';

/** A config value that may be live: the plain value formodel declares, or a signal of it. */
export type ReactiveValue<T> = T | Signal<T>;

/** Reads a maybe-live value: unwraps a signal, passes a plain value through. */
export function readReactive<T>(value: ReactiveValue<T>): T {
  return isSignal(value) ? (value as Signal<T>)() : (value as T);
}

/** Derives from a maybe-live value without losing its liveness: a signal maps to a `computed`, a value maps once. */
export function mapReactive<T, R>(value: ReactiveValue<T>, fn: (value: T) => R): ReactiveValue<R> {
  return isSignal(value) ? computed(() => fn((value as Signal<T>)())) : fn(value as T);
}

/** Widens a signal to the plain value formodel's helpers expect; the renderer unwraps it at binding time. */
export function reactive<T>(value: Signal<T>): T {
  return value as T;
}

/** A formodel control node with every presentational prop widened to accept a signal; `type` stays plain. */
export type ReactiveControlNode<N extends UiFormControlNode = UiFormControlNode> =
  N extends UiFormControlNode
    ? { [K in keyof N]: K extends 'type' ? N[K] : ReactiveValue<N[K]> }
    : never;

type ReactiveUiNode<V> = V extends UiFormGroupNode<infer T>
  ? Omit<V, 'controlsConfig'> & { readonly controlsConfig: ReactiveUiConfig<T> }
  : V extends RepeatingGroupNode<infer U>
    ? Omit<V, 'itemConfig'> & { readonly itemConfig: ReactiveUiConfig<U> }
    : V extends UiFormControlNode
      ? ReactiveControlNode<V>
      : V;

/** `UiFormGroupConfig<M>` with control props widened to {@link ReactiveValue}; every plain formodel config is assignable. */
export type ReactiveUiConfig<M> = {
  [K in keyof UiFormGroupConfig<M>]: ReactiveUiNode<UiFormGroupConfig<M>[K]>;
};
