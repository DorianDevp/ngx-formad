import { commitToShared, seedFromShared, SharedSlot, SyncField } from './directional-sync';

// A field double that mirrors the real wiring: a plain value cell plus a
// user-edited flag. `seed` is a non-dirtying write, so it leaves `edited` alone
// — exactly what `reset(value)` / a programmatic `value.set` do on a real field.
function fakeField<V>(initial: V): SyncField<V> & { edit(value: V): void } {
  let value = initial;
  let edited = false;
  return {
    read: () => value,
    seed: (v) => {
      value = v;
    },
    pristine: () => !edited,
    // Stands in for a real user edit: changes the value AND trips the gate.
    edit: (v) => {
      value = v;
      edited = true;
    },
  };
}

function fakeSlot<V>(initial: V): SharedSlot<V> {
  let value = initial;
  return { read: () => value, write: (v) => (value = v) };
}

describe('directional sync', () => {
  it('seeds a pristine field from shared on entry', () => {
    const field = fakeField('');
    const shared = fakeSlot('alice@example.com');

    seedFromShared(field, shared);

    expect(field.read()).toBe('alice@example.com');
  });

  it('does not clobber a value the user entered', () => {
    const field = fakeField('');
    const shared = fakeSlot('seed@example.com');

    field.edit('typed@example.com');
    seedFromShared(field, shared);

    expect(field.read()).toBe('typed@example.com');
  });

  it('writes the field value back to shared on commit', () => {
    const field = fakeField('');
    const shared = fakeSlot('');

    field.edit('typed@example.com');
    commitToShared(field, shared);

    expect(shared.read()).toBe('typed@example.com');
  });

  it('keeps untouched fields tracking later upstream changes', () => {
    const field = fakeField('');
    const shared = fakeSlot('first@example.com');

    // First entry seeds the field.
    seedFromShared(field, shared);
    expect(field.read()).toBe('first@example.com');

    // Shared changes elsewhere; a second entry re-seeds because still pristine.
    shared.write('second@example.com');
    seedFromShared(field, shared);
    expect(field.read()).toBe('second@example.com');
  });

  it('survives a revisitable round trip without oscillating', () => {
    // step 1 field and step 5 field share one slot.
    const step1 = fakeField('');
    const step5 = fakeField('');
    const shared = fakeSlot('');

    // Enter step 1, type, commit on the way out.
    seedFromShared(step1, shared);
    step1.edit('me@example.com');
    commitToShared(step1, shared);

    // Enter step 5: pristine, so it picks up the shared value.
    seedFromShared(step5, shared);
    expect(step5.read()).toBe('me@example.com');

    // Go back to step 1 and re-enter: it was edited, so it is left untouched.
    seedFromShared(step1, shared);
    expect(step1.read()).toBe('me@example.com');

    // Nothing ran a standing effect, so values are stable — no back-edge exists.
    expect(shared.read()).toBe('me@example.com');
  });

  it('lets a later step override shared, flowing forward but not backward', () => {
    const step1 = fakeField('');
    const step5 = fakeField('');
    const shared = fakeSlot('');

    step1.edit('one@example.com');
    commitToShared(step1, shared);

    seedFromShared(step5, shared);
    step5.edit('five@example.com');
    commitToShared(step5, shared);

    // step 1 is edited, so re-entry does not pull step 5's newer value back.
    seedFromShared(step1, shared);
    expect(step1.read()).toBe('one@example.com');
    expect(shared.read()).toBe('five@example.com');
  });
});
