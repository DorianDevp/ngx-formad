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

  it('hands out a slot that round-trips one key', () => {
    const state = new SharedState({ email: '' });
    const slot = state.slot('email');

    slot.write('via-slot@example.com');

    expect(slot.read()).toBe('via-slot@example.com');
    expect(state.get('email')).toBe('via-slot@example.com');
  });
});
