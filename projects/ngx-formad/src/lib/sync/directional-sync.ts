// Cross-step shared state is the one thing native signal forms does not attempt,
// and it is where this kind of library usually dies — in a two-way binding that
// oscillates. The whole design here is to *not* have a two-way binding.
//
// Sync is directional and discrete:
//
//   (a) shared -> field   seeds the field on step entry, but only while the user
//                         has not edited it. Upstream changes still reach fields
//                         the user has not touched; an entered value is left
//                         exactly as typed.
//   (b) field -> shared   writes back on a commit event (blur / submit), once,
//                         not on every keystroke and not through a standing
//                         subscription.
//
// (a) fires only on entry and (b) only on commit, so there is no reactive
// back-edge: nothing feeds a loop, so there is nothing to reconcile and nothing
// can oscillate. That absence is the entire reason to go directional.

/** A field as the sync engine sees it — no Angular, so this stays unit-testable. */
export interface SyncField<V> {
  /** The field's current value. */
  read(): V;
  /**
   * Writes a seed value into the field. The renderer wires this to a write that
   * does not mark the field dirty (a plain `value.set`, or `reset(value)`), so a
   * seed never trips the pristine gate it is itself guarded by.
   */
  seed(value: V): void;
  /**
   * Whether the field is still untouched by the user. The renderer wires this to
   * `() => !state.dirty()`. Gating on dirty, not touched, is deliberate: the
   * surprise we prevent is overwriting a value the user *entered*, and a blur
   * without typing flips touched but not dirty.
   */
  pristine(): boolean;
}

/** A single shared-state slot as the sync engine sees it. */
export interface SharedSlot<V> {
  read(): V;
  write(value: V): void;
}

/** shared -> field, on entry. Seeds only a pristine field; see (a) above. */
export function seedFromShared<V>(field: SyncField<V>, shared: SharedSlot<V>): void {
  if (field.pristine()) field.seed(shared.read());
}

/** field -> shared, on commit. Discrete write-back; see (b) above. */
export function commitToShared<V>(field: SyncField<V>, shared: SharedSlot<V>): void {
  shared.write(field.read());
}
