import { Signal } from '@angular/core';

/** One recorded link: the path to the model field and the shared key it syncs with. */
export interface LinkPair {
  readonly modelPath: readonly string[];

  readonly sharedKey: string;
}

/** A reference to one model field, carrying its path and its value type. */
export interface FieldRef<T> {
  readonly path: readonly string[];

  readonly value?: T;
}

/** A form's model as field references; a nested group is a reference and a record of them alike. */
export type FieldRefs<M> = {
  readonly [K in keyof M & string]: M[K] extends Record<string, unknown>
    ? FieldRefs<M[K]> & FieldRef<M[K]>
    : FieldRef<M[K]>;
};

/** One slot of the shared store, carrying its key and its value type. */
export interface SharedSlot<T> {
  readonly key: string;

  readonly value?: T;
}

/** The shared store as slots, one per key, with the signals unwrapped. */
export type SharedSlots<TShared> = {
  readonly [K in keyof TShared & string]: TShared[K] extends Signal<infer V> ? SharedSlot<V> : never;
};

/** Binds a field to a shared slot of the same type: seeded into the field on entry, committed back on leave. */
export function link<T>(field: FieldRef<T>, slot: SharedSlot<T>): LinkPair {
  return { modelPath: field.path, sharedKey: slot.key };
}

/** Field references that record the path they were reached by, so `link` needs no strings. */
export function fieldRefs<M>(path: readonly string[] = []): FieldRefs<M> {
  return new Proxy({ path } as Record<string, unknown>, {
    get: (own, key: string) => (key === 'path' ? own['path'] : fieldRefs([...path, key])),
  }) as FieldRefs<M>;
}

/** Store slots named by the key they were reached by. */
export function sharedSlots<TShared>(): SharedSlots<TShared> {
  return new Proxy({} as Record<string, unknown>, { get: (_own, key: string) => ({ key }) }) as SharedSlots<TShared>;
}
