// Selectors are typed callbacks, not magic strings, so a link site is
// refactor-safe and its two value types are checked against each other. A
// `FieldRef` is a phantom handle: it carries the key's type (and the value type,
// only to constrain `link`) but at runtime is just the key. The same Proxy trick
// powers both the pool selector (`f => f.account`) and the link selectors.

/** A phantom handle to one field: its key `K` and value `V`, key-only at runtime. */
export interface FieldRef<K, V> {
  readonly __key: K;
  /** Phantom — never read; present so `link` can require matching value types. */
  readonly __value?: V;
}

/** Every field of `T` as a selectable `FieldRef`. */
export type FieldRefs<T> = { [K in keyof T]: FieldRef<K, T[K]> };

/** Fluent recorder of model-field <-> shared-key links for one form instance. */
export interface SharedLink<M, S> {
  link<V>(
    model: (m: FieldRefs<M>) => FieldRef<keyof M, V>,
    shared: (s: FieldRefs<S>) => FieldRef<keyof S, V>,
  ): SharedLink<M, S>;
}

/** One recorded link: which model key syncs with which shared key. */
export interface LinkPair {
  readonly modelKey: string;
  readonly sharedKey: string;
}

// A Proxy whose every property access yields a `FieldRef` carrying that key.
// Nothing is ever instantiated; selectors just read a key back out.
function fieldRefs<T>(): FieldRefs<T> {
  return new Proxy({}, { get: (_target, prop) => ({ __key: prop }) }) as FieldRefs<T>;
}

/** Runs a `bind` callback and returns the links it declared. */
export function recordLinks<M, S>(configure: (link: SharedLink<M, S>) => void): LinkPair[] {
  const pairs: LinkPair[] = [];
  const recorder: SharedLink<M, S> = {
    link(modelSelect, sharedSelect) {
      const modelRef = modelSelect(fieldRefs<M>());
      const sharedRef = sharedSelect(fieldRefs<S>());
      pairs.push({ modelKey: String(modelRef.__key), sharedKey: String(sharedRef.__key) });
      return recorder;
    },
  };
  configure(recorder);
  return pairs;
}

/** Reads the selected key out of a pool selector like `f => f.account`. */
export function selectedKey<T>(select: (refs: FieldRefs<T>) => FieldRef<keyof T, unknown>): string {
  return String(select(fieldRefs<T>()).__key);
}
