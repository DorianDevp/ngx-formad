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

// ── Output effects ──
// A control may emit outputs beyond its value (a NIP field that resolves a company).
// `effects` on `addForm` wires such an output to patch sibling fields: pick the
// field whose control emits, name the output, and update the form model. Recorded
// the same way as `bind`, with a typed model selector and a free payload type.

/** A handler that patches the form `model` in response to a control's output. */
export type OutputHandler<M, P> = (payload: P, model: WritableModel<M>) => void;
/** The model surface a handler may update — just `WritableSignal`'s shape, kept
 *  local so this file stays Angular-free. */
export interface WritableModel<M> {
  (): M;
  set(value: M): void;
  update(updater: (current: M) => M): void;
}

/** Fluent recorder of control-output -> model-patch effects for one form. */
export interface FormEffects<M> {
  on<P>(
    field: (m: FieldRefs<M>) => FieldRef<PropertyKey, unknown>,
    output: string,
    handler: OutputHandler<M, P>,
  ): FormEffects<M>;
}

/** One recorded effect: the emitting field's path, the output name, the handler. */
export interface OutputEffect {
  readonly modelPath: readonly string[];
  readonly output: string;
  readonly handler: OutputHandler<Record<string, unknown>, unknown>;
}

/** Runs an `effects` callback and returns the effects it declared. */
export function recordEffects<M>(configure: (e: FormEffects<M>) => void): OutputEffect[] {
  const effects: OutputEffect[] = [];
  const recorder: FormEffects<M> = {
    on(field, output, handler) {
      const ref = field(fieldRefs<M>());
      effects.push({
        modelPath: [...ref.__path],
        output,
        handler: handler as OutputEffect['handler'],
      });
      return recorder;
    },
  };
  configure(recorder);
  return effects;
}
