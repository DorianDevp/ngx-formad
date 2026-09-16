import { Signal } from '@angular/core';
import {
  RepeatingGroupNode,
  SelectFormControlNode,
  UiFormControlNode,
  UiFormGroupConfig,
  UiFormGroupNode,
} from 'formodel';

/** One option of a `select`/`multiselect` field, as formodel declares it. */
export type SelectOption = SelectFormControlNode['options'][number];

/** A group node as the structural walk sees it: label, columns and erased children. */
export interface ErasedGroupNode {
  readonly label: string;

  readonly maxCols: number;

  readonly controlsConfig: ErasedUi;
}

/** A repeating group as the structural walk sees it: array options and an erased item config. */
export interface ErasedArrayNode<TItem extends Record<string, unknown> = Record<string, unknown>>
  extends Omit<RepeatingGroupNode<TItem>, 'itemConfig'> {
  readonly itemConfig: ErasedUi;
}

/** A registered custom control node as the renderer sees it: its kind and its typed props bag, plain — a kind's props are static. */
export interface CustomKindNode<P extends Record<string, unknown> = Record<string, unknown>> {
  readonly type: string;

  readonly props: P;
}

/** A formodel control node with every presentational prop accepting a signal beside its plain value; `type` stays plain. */
export type SignalControlNode<N extends UiFormControlNode = UiFormControlNode> = N extends UiFormControlNode
  ? {
      [K in keyof N]: K extends 'type'
        ? N[K]
        : Exclude<N[K], undefined> | Signal<Exclude<N[K], undefined>>;
    }
  : never;

type SignalUiNode<V> = V extends UiFormGroupNode<infer T>
  ? Omit<V, 'controlsConfig'> & { readonly controlsConfig: SignalUiConfig<T> }
  : V extends RepeatingGroupNode<infer I>
    ? Omit<V, 'itemConfig'> & { readonly itemConfig: SignalUiConfig<I> }
    : V extends { readonly props: infer P extends Record<string, unknown> }
      ? Omit<V, 'props'> & { readonly props: P }
      : V extends UiFormControlNode
        ? SignalControlNode<V>
        : V;

/** `UiFormGroupConfig<M>` with control props widened to accept signals; every plain formodel config is assignable as it is. */
export type SignalUiConfig<M> = {
  [K in keyof UiFormGroupConfig<M>]: SignalUiNode<UiFormGroupConfig<M>[K]>;
};

/** A scalar field's node: a formodel control node, signals allowed among its props, or a registered custom kind. */
export type FieldNode = SignalControlNode | CustomKindNode;

/** One node of the erased ui: a scalar field, a group or a repeating group. */
export type ErasedUiNode = FieldNode | ErasedGroupNode | ErasedArrayNode;

/** The authored ui viewed by structure: model keys to nodes. */
export type ErasedUi = Readonly<Record<string, ErasedUiNode>>;
