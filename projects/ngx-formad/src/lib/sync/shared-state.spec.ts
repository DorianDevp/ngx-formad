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
  // `structuredClone` copes with a cycle; the structural fallback used in a jsdom test
  // environment must not be the weaker of the two.
  it('copies a value that points back at itself', () => {
    type Node = { name: string; self?: Node };
    const node: Node = { name: 'root' };
    node.self = node;

    const store = new SharedState({ node });
    const held = store.get('node') as Node;

    expect(held).not.toBe(node);
    expect(held.self).toBe(held);
    expect(held.name).toBe('root');
  });
});
