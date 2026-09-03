import { Signal } from '@angular/core';

type SameValue<A, B> = [A, B] extends [B, A] ? true : false;

/** The shared keys whose signal carries exactly `V`. */
export type SharedKeyFor<TShared, V> = {
  [K in keyof TShared]: TShared[K] extends Signal<infer X>
    ? SameValue<X, V> extends true
      ? K
      : never
    : never;
}[keyof TShared] &
  string;

/** Model fields linked to shared keys of the same value type; a nested group links through a nested record. */
export type SharedLinks<M, TShared> = {
  readonly [K in keyof M]?: M[K] extends readonly unknown[]
    ? SharedKeyFor<TShared, M[K]>
    : M[K] extends Record<string, unknown>
      ? SharedLinks<M[K], TShared> | SharedKeyFor<TShared, M[K]>
      : SharedKeyFor<TShared, M[K]>;
};

/** A `bind` record as the recorder walks it: shared keys at the leaves, records for nested groups. */
export interface LinkRecord {
  readonly [key: string]: string | LinkRecord | undefined;
}

/** One recorded link: the path to the model field and the shared key it syncs with. */
export interface LinkPair {
  readonly modelPath: readonly string[];

  readonly sharedKey: string;
}

/** Turns a `bind` record into link pairs, one per leaf. */
export function recordLinks(links: LinkRecord, path: readonly string[] = []): LinkPair[] {
  const pairs: LinkPair[] = [];
  for (const key in links) {
    const target = links[key];
    if (target === undefined) continue;

    const modelPath = [...path, key];
    typeof target === 'string'
      ? pairs.push({ modelPath, sharedKey: target })
      : pairs.push(...recordLinks(target, modelPath));
  }

  return pairs;
}

/** The writable model surface an output handler receives. */
export interface WritableModel<M> {
  (): M;

  set(value: M): void;

  update(updater: (current: M) => M): void;
}

/** One control output wired to a model patch. */
export interface OutputEffectCfg<M extends Record<string, unknown> = Record<string, unknown>, P = unknown> {
  readonly output: string;

  handler(payload: P, model: WritableModel<M>): void;
}

/** Control-output effects by the emitting field; a nested group nests the record, handlers patch the root model. */
export type FormEffects<M extends Record<string, unknown>, Root extends Record<string, unknown> = M> = {
  readonly [K in keyof M]?: M[K] extends readonly unknown[]
    ? readonly OutputEffectCfg<Root>[]
    : M[K] extends Record<string, unknown>
      ? FormEffects<M[K], Root> | readonly OutputEffectCfg<Root>[]
      : readonly OutputEffectCfg<Root>[];
};

/** An `effects` record as the recorder walks it: effect lists at the leaves, records for nested groups. */
export interface EffectRecord {
  readonly [key: string]: readonly OutputEffectCfg[] | EffectRecord | undefined;
}

/** One recorded effect: the path to the emitting field, the output name and the handler. */
export interface OutputEffect<M extends Record<string, unknown> = Record<string, unknown>, P = unknown> {
  readonly modelPath: readonly string[];

  readonly output: string;

  handler(payload: P, model: WritableModel<M>): void;
}

/** Turns an `effects` record into recorded effects, one per declared output. */
export function recordEffects(effects: EffectRecord, path: readonly string[] = []): OutputEffect[] {
  const recorded: OutputEffect[] = [];
  for (const key in effects) {
    const target = effects[key];
    if (target === undefined) continue;

    const modelPath = [...path, key];
    if (!(Symbol.iterator in target)) {
      recorded.push(...recordEffects(target, modelPath));
      continue;
    }
    for (const effect of target) {
      recorded.push({ modelPath, output: effect.output, handler: effect.handler });
    }
  }

  return recorded;
}
