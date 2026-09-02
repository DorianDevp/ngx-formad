import { FieldState, FieldTree } from '@angular/forms/signals';
import { SyncField } from './directional-sync';

/** Bridges a live field to the sync engine: `pristine` reads the native `dirty` flag, `seed` writes without dirtying. */
export function fieldSync<V>(node: FieldTree<V>): SyncField<V> {
  const state = node() as FieldState<V>;

  return {
    read: () => state.value(),
    seed: (value) => state.value.set(value),
    pristine: () => !state.dirty(),
  };
}
