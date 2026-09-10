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

/** Binds a field to a shared slot of the same type: seeded into the field on entry, committed back on leave. */
export function link<T>(field: FieldRef<T>, slot: SharedSlot<T>): LinkPair {
  const modelPath = field[FIELD_PATH];
  const sharedKey = slot[SLOT_KEY];
  // A spread or a hand-made object loses the carrier; say so here, not three files away at seed time.
  if (!Array.isArray(modelPath) || typeof sharedKey !== 'string') {
    throw new Error('ngx-formad: link() takes the field and slot fieldValueBindings hands over, not a copy of one.');
  }

  return { modelPath, sharedKey };
}

/** Field references that record the path they were reached by, so `link` needs no strings. */
export function fieldRefs<M>(path: readonly string[] = []): FieldRefs<M> {
  return new Proxy({} as Record<string | symbol, unknown>, {
    get: (_own, key) => {
      if (key === FIELD_PATH) return path;
      // Only a field name walks deeper; anything else (a symbol, an inspection hook) is simply not there.
      return typeof key === 'string' ? fieldRefs([...path, key]) : undefined;
    },
  }) as FieldRefs<M>;
}

/** Store slots named by the key they were reached by. */
export function sharedSlots<TShared>(): SharedSlots<TShared> {
  return new Proxy({} as Record<string | symbol, unknown>, {
    get: (_own, key) => (typeof key === 'string' ? { [SLOT_KEY]: key } : undefined),
  }) as SharedSlots<TShared>;
}
