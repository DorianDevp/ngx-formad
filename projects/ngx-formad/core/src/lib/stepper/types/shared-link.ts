import { Signal } from '@angular/core';

/** One recorded link: the path to the model field and the shared key it syncs with. */
export interface LinkPair {
  readonly modelPath: readonly string[];

  readonly sharedKey: string;
}

/**
 * Where a reference keeps its path, and a slot its key: symbols, so no model field or store key can shadow them, and
 * registered ones, so two loaded copies of the library still agree on the carrier.
 */
export const FIELD_PATH: unique symbol = Symbol.for('ngx-formad.field-path');

const VALUE_TYPE: unique symbol = Symbol.for('ngx-formad.value-type');

/** A reference to one model field, carrying its path and its value type. */
export interface FieldRef<T> {
  readonly [FIELD_PATH]: readonly string[];

  readonly [VALUE_TYPE]?: T;
}

/** A form's model as field references; a nested group is a reference and a record of them alike. */
export type FieldRefs<M> = {
  readonly [K in keyof M & string]: M[K] extends Record<string, unknown>
    ? FieldRefs<M[K]> & FieldRef<M[K]>
    : FieldRef<M[K]>;
};

/** Where a slot keeps its key. */
export const SLOT_KEY: unique symbol = Symbol.for('ngx-formad.slot-key');

/** One slot of the shared store, carrying its key and its value type. */
export interface SharedSlot<T> {
  readonly [SLOT_KEY]: string;

  readonly [VALUE_TYPE]?: T;
}

/** The shared store as slots, one per key, with the signals unwrapped. */
export type SharedSlots<TShared> = {
  readonly [K in keyof TShared & string]: TShared[K] extends Signal<infer V> ? SharedSlot<V> : never;
};
