import { signal } from '@angular/core';
import { createSharedState, resetSharedState } from './shared-state';

describe('SharedState', () => {
  it('exposes initial values per key', () => {
    const state = createSharedState({ email: '', count: 0 });
    expect(state.email()).toBe('');
    expect(state.count()).toBe(0);
  });

  it('writes one key and leaves the others untouched', () => {
    const state = createSharedState({ email: 'a', name: 'b' });
    state.email.set('c');
    expect(state.email()).toBe('c');
    expect(state.name()).toBe('b');
  });

  it('copies a seed, so writing the store never touches the seed record', () => {
    const seeds = { tags: ['a'] };
    const state = createSharedState(seeds);
    state.tags.update((tags) => [...tags, 'b']);

    expect(seeds.tags).toEqual(['a']);
  });

  it('puts every key back to its seed on reset', () => {
    const seeds = { email: '', count: 0 };
    const state = createSharedState(seeds);
    state.email.set('x');
    state.count.set(3);

    resetSharedState(state, seeds);

    expect([state.email(), state.count()]).toEqual(['', 0]);
  });
});

describe('SharedState - a key held in a signal of your own', () => {
  it('reads and writes through the signal it was given', () => {
    const email = signal('a');
    const state = createSharedState({ email, count: 0 });

    email.set('outside');
    expect(state.email()).toBe('outside');

    state.email.set('written');
    expect(email()).toBe('written');
  });

  it('leaves the signal alone on reset: the author owns it', () => {
    const email = signal('a');
    const seeds = { email, count: 0 };
    const state = createSharedState(seeds);
    email.set('b');
    state.count.set(5);

    resetSharedState(state, seeds);

    expect(email()).toBe('b');
    expect(state.count()).toBe(0);
  });
});
