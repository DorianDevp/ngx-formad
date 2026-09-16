import { FIELD_PATH, FieldRef, FieldRefs, LinkPair, SharedSlot, SharedSlots, SLOT_KEY } from '../types/shared-link';

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
