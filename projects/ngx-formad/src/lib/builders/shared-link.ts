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
