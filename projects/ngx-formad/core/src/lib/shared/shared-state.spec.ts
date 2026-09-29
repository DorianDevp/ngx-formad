import { signal } from '@angular/core';
import { SharedState } from './shared-state';

describe('SharedState', () => {
  it('exposes initial values per key', () => {
    const state = new SharedState({ email: '', count: 0 });
    expect(state.get('email')).toBe('');
    expect(state.get('count')).toBe(0);
  });

  it('reflects patched values through select() signals', () => {
    const state = new SharedState({ email: '' });
    const email = state.select('email');

    state.patch({ email: 'alice@example.com' });

    expect(email()).toBe('alice@example.com');
  });

  it('leaves keys absent from a patch untouched', () => {
    const state = new SharedState({ email: 'a', name: 'b' });
    state.patch({ email: 'c' });
    expect(state.get('name')).toBe('b');
  });

  it('hands out a read-only signal that tracks one key', () => {
    const state = new SharedState({ email: '' });
    const email = state.select('email');

    state.patch({ email: 'via-patch@example.com' });

    expect(email()).toBe('via-patch@example.com');
    expect(state.get('email')).toBe('via-patch@example.com');
  });
});

describe('SharedState - a key held in a signal of your own', () => {
  it('reads and writes through the signal it was given', () => {
    const email = signal('a');
    const state = new SharedState({ email, count: 0 });

    email.set('outside');
    expect(state.get('email')).toBe('outside');

    state.patch({ email: 'patched' });
    expect(email()).toBe('patched');
  });

  it('hands the signal on as a seed, so a store rebuilt from the seeds keeps it as the cell', () => {
    const email = signal('a');
    const state = new SharedState({ ...new SharedState({ email }).seeds(), count: 1 });

    state.patch({ email: 'patched' });

    expect(email()).toBe('patched');
    expect(state.get('count')).toBe(1);
  });

  it('leaves the signal alone on reset: the author owns it', () => {
    const email = signal('a');
    const state = new SharedState({ email, count: 0 });
    email.set('b');
    state.patch({ count: 5 });

    state.reset();

    expect(email()).toBe('b');
    expect(state.get('count')).toBe(0);
  });
});
