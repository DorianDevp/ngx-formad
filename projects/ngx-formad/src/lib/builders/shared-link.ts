import { ErasedRecord, ErasedValue } from './step-context';

/** A phantom handle to a field: its leaf key `K`, its value `V` and the path from the model root. */
export interface FieldRef<K, V> {
  readonly __key: K;

  readonly __path: readonly string[];

  readonly __value?: V;
}

type FieldRefOf<V, K> = [V] extends [ErasedRecord] ? FieldRef<K, V> & FieldRefs<V> : FieldRef<K, V>;

/** Every field of `T` as a selectable ref; object-valued keys are navigable further. */
export type FieldRefs<T> = { [K in keyof T]: FieldRefOf<T[K], K> };

/** Records model-field to shared-key links for one placed form; both sides must carry the same value type. */
export interface SharedLink<M, S> {
  link<V>(
    model: (m: FieldRefs<M>) => FieldRef<PropertyKey, V>,
    shared: (s: FieldRefs<S>) => FieldRef<keyof S, V>,
  ): SharedLink<M, S>;
}

/** One recorded link: the model path and the shared key it syncs with. */
export interface LinkPair {
  readonly modelPath: readonly string[];

  readonly sharedKey: string;
}

function fieldRefs<T>(path: readonly string[] = []): FieldRefs<T> {
  const handler: ProxyHandler<object> = {
    get: (_target, prop) => {
      if (prop === '__path') return path;
      if (prop === '__key') return path[path.length - 1];

      return fieldRefs([...path, String(prop)]);
    },
  };

  return new Proxy({}, handler) as FieldRefs<T>;
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

/** Reads the selected key out of a pool selector such as `forms => forms.account`. */
export function selectedKey<T>(select: (refs: FieldRefs<T>) => FieldRef<keyof T, ErasedValue>): string {
  return String(select(fieldRefs<T>()).__key);
}

/** The writable model surface an output handler receives. */
export interface WritableModel<M> {
  (): M;

  set(value: M): void;

  update(updater: (current: M) => M): void;
}

/** Patches the form model in response to a control output's payload. */
export type OutputHandler<M, P> = (payload: P, model: WritableModel<M>) => void;

/** One control output wired to a model patch: the output's public name and its handler. */
export interface OutputEffectCfg<M, P> {
  readonly output: string;

  readonly handler: OutputHandler<M, P>;
}

/** Records control-output effects for one placed form. */
export interface FormEffects<M> {
  on<P>(
    field: (m: FieldRefs<M>) => FieldRef<PropertyKey, ErasedValue>,
    effect: OutputEffectCfg<M, P>,
  ): FormEffects<M>;
}

/** One recorded effect: the emitting field's path, the output name and the erased handler. */
export interface OutputEffect {
  readonly modelPath: readonly string[];

  readonly output: string;

  readonly handler: OutputHandler<ErasedRecord, ErasedValue>;
}

/** Runs an `effects` callback and returns the effects it declared. */
export function recordEffects<M>(configure: (effects: FormEffects<M>) => void): OutputEffect[] {
  const effects: OutputEffect[] = [];
  const recorder: FormEffects<M> = {
    on(field, effect) {
      const ref = field(fieldRefs<M>());
      effects.push({
        modelPath: [...ref.__path],
        output: effect.output,
        handler: effect.handler as OutputHandler<ErasedRecord, ErasedValue>,
      });

      return recorder;
    },
  };
  configure(recorder);

  return effects;
}
