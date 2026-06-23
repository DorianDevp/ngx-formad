import { FieldState, FieldTree } from '@angular/forms/signals';
import { SyncField } from './directional-sync';

// Bridges a live field node to the engine's view of it. This is the only place
// the abstract `SyncField` meets a real `form()`:
//
//   - `pristine` reads the native `dirty` flag. The renderer's `FormField`
//     directive maintains it on real user edits, so the gate reflects exactly
//     "has the user changed this".
//   - `seed` writes through the field's value signal. A programmatic write does
//     not mark the field dirty, so a seed never trips the gate it is guarded by.
//     (`node().reset(value)` would also work and additionally clears touched;
//     a plain set is used so a seed leaves touched state alone.)
export function fieldSync<V>(node: FieldTree<V>): SyncField<V> {
  // `node()` widens to a compat-or-plain field-state union for an unconstrained
  // V; this cast pins it to the plain `FieldState<V>` we actually have.
  const state = node() as FieldState<V>;
  return {
    read: () => state.value(),
    seed: (value) => state.value.set(value),
    pristine: () => !state.dirty(),
  };
}
