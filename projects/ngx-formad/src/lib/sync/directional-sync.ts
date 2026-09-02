/** A field as the sync engine sees it: read, seed without dirtying, and whether the user has edited it. */
export interface SyncField<V> {
  read(): V;

  seed(value: V): void;

  pristine(): boolean;
}

/** One shared-state slot as the sync engine sees it. */
export interface SharedSlot<V> {
  read(): V;

  write(value: V): void;
}

/** Shared to field, on step entry: seeds only a field the user has not edited. */
export function seedFromShared<V>(field: SyncField<V>, shared: SharedSlot<V>): void {
  if (field.pristine()) field.seed(shared.read());
}

/** Field to shared, on commit: a discrete write-back, never a standing subscription. */
export function commitToShared<V>(field: SyncField<V>, shared: SharedSlot<V>): void {
  shared.write(field.read());
}
