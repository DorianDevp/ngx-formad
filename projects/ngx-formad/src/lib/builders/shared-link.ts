// Selectors are typed callbacks, not magic strings, so a link site is
// refactor-safe and its two value types are checked against each other. A
// `FieldRef` is a phantom handle: it carries the leaf key's type and value type
// (only to constrain `link`), plus the full path from the model root, but at
// runtime is just that path. The same recursive Proxy powers the pool selector
// (`f => f.account`) and the link selectors (`m => m.address.city`).

/** A phantom handle to a field: its leaf key `K`, value `V`, and full path. */
export interface FieldRef<K, V> {
  readonly __key: K;
  /** The path from the model root to this field, e.g. `['address','city']`. */
  readonly __path: readonly string[];
  /** Phantom — never read; present so `link` can require matching value types. */
  readonly __value?: V;
}

/** Every field of `T` as a selectable ref. Object-valued keys are *also* navigable
 *  (`m.address.city`), so nested fields can be linked, not just top-level ones. */
export type FieldRefs<T> = { [K in keyof T]: FieldRefOf<T[K], K> };
type FieldRefOf<V, K> = V extends Record<string, unknown>
  ? FieldRef<K, V> & FieldRefs<V>
  : FieldRef<K, V>;

/** Fluent recorder of model-field <-> shared-key links for one form instance. */
export interface SharedLink<M, S> {
  link<V>(
    model: (m: FieldRefs<M>) => FieldRef<PropertyKey, V>,
    shared: (s: FieldRefs<S>) => FieldRef<keyof S, V>,
  ): SharedLink<M, S>;
}

/** One recorded link: which model path syncs with which (flat) shared key. */
export interface LinkPair {
  /** Path to the model field; `['nip']` for a top-level field, deeper for nested. */
  readonly modelPath: readonly string[];
  readonly sharedKey: string;
}

// A recursive Proxy: every property access extends the path and yields another
// ref. Nothing is ever instantiated; `__key`/`__path` read the accumulated path
// back out.
function fieldRefs<T>(path: readonly string[] = []): FieldRefs<T> {
  return new Proxy(
    {},
    {
      get: (_target, prop: string | symbol) => {
        if (prop === '__path') return path;
        if (prop === '__key') return path[path.length - 1];
        return fieldRefs([...path, String(prop)]);
      },
    },
  ) as FieldRefs<T>;
}

/** Runs a `bind` callback and returns the links it declared. */
export function recordLinks<M, S>(configure: (link: SharedLink<M, S>) => void): LinkPair[] {
  const pairs: LinkPair[] = [];
  const recorder: SharedLink<M, S> = {
    link(modelSelect, sharedSelect) {
      const modelRef = modelSelect(fieldRefs<M>());
      const sharedRef = sharedSelect(fieldRefs<S>());
      pairs.push({ modelPath: [...modelRef.__path], sharedKey: String(sharedRef.__key) });
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
