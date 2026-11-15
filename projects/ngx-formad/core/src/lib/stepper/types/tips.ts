import { Rejected } from '../../types';
import type { ArmContext, gatedBy } from './builder';
import { RuntimeStepperContext, StepperContext } from './step-context';

type UnionToIntersection<U> = (U extends U ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

type LastOf<U> = UnionToIntersection<U extends U ? () => U : never> extends () => infer R ? R : never;

/** The entries a gate may have skipped: those typed `| undefined`. */
type GatedKeys<S> = { [K in keyof S]-?: undefined extends S[K] ? K : never }[keyof S];

/** The name of the gate an entry stands behind (`gate()`), or `never` for one gated by a plain condition. */
type GateOf<T> = typeof gatedBy extends keyof Exclude<T, undefined>
  ? Exclude<T, undefined> extends { readonly [gatedBy]?: infer G extends string }
    ? G
    : never
  : never;

/** What splits a walk: a gated entry on its own, or every entry behind one named gate together. */
type SplitUnits<S> = {
  [K in GatedKeys<S>]: [GateOf<S[K]>] extends [never] ? K : { readonly gate: GateOf<S[K]> };
}[GatedKeys<S>];

type KeysBehind<S, G> = { [K in GatedKeys<S>]: G extends GateOf<S[K]> ? K : never }[GatedKeys<S>];

type Flat<S> = { readonly [K in keyof S]: S[K] };

type Present<S, K extends keyof S> = Omit<S, K> & { readonly [P in K]: Exclude<S[P], undefined> };

/**
 * Every set of entries a walk can have ended with: each unit of a split (a plainly gated entry, or all the entries
 * behind one named gate) either there, without `undefined`, or not there at all; the ungated entries always there. A
 * union to narrow with `'step' in ctx.steps`, never with `?.`.
 */
export type WalkedSteps<S, U = SplitUnits<S>> = [U] extends [never]
  ? Flat<S>
  : LastOf<U> extends infer X
    ? X extends { readonly gate: infer G }
      ? WalkedSteps<Present<S, KeysBehind<S, G>>, Exclude<U, X>> | WalkedSteps<Omit<S, KeysBehind<S, G>>, Exclude<U, X>>
      : X extends keyof S
        ? WalkedSteps<Present<S, X>, Exclude<U, X>> | WalkedSteps<Omit<S, X>, Exclude<U, X>>
        : never
    : never;

/** The context a tip's mapper reads: the steps the flow walked to reach it, as it entered them, and the level's store. */
export type TipContext<C extends RuntimeStepperContext> = StepperContext<
  C['shared'],
  WalkedSteps<C['steps']>,
  C['parent'],
  C['flow']
>;

/** What a fork hands to `build()` to map: each tip, an arm that ends the flow, by name, with the context it ends in. */
export interface TipsCarrier<T> {
  readonly __tips: T;
}

type ArmTips<K extends PropertyKey, Fn> = Fn extends (arm: never) => TipsCarrier<infer T>
  ? T
  : { readonly [P in K]: ArmContext<Fn> };

/** A fork's tips by name: each arm that ends the flow, a nested fork's own tips in place of its arm. */
export type ForkTips<A> = UnionToIntersection<{ [K in keyof A]: ArmTips<K, A[K]> }[keyof A]>;

type TipNames<K extends PropertyKey, Fn> = keyof ArmTips<K, Fn>;

/** Tip names two arms both end in; `never` when every tip is named apart. */
export type RepeatedTips<A> = {
  [K in keyof A]: TipNames<K, A[K]> & { [J in Exclude<keyof A, K>]: TipNames<J, A[J]> }[Exclude<keyof A, K>];
}[keyof A];

/** One mapper per tip: what the stepper hands out when the flow ends there, over the context it ended in. */
export type TipMappers<T> = {
  readonly [K in keyof T]: (ctx: T[K] extends RuntimeStepperContext ? TipContext<T[K]> : never) => unknown;
};

/**
 * The mappers `build()` takes: exactly the fork's tips, every one; a key that is no tip, or a fork whose tips repeat a
 * name, is refused.
 */
export type ExactTipMappers<M, T, A> = [RepeatedTips<A>] extends [never]
  ? M & TipMappers<T> & { readonly [K in Exclude<keyof M, keyof T>]: Rejected<`'${K & string}' is no tip of the fork`> }
  : Rejected<`tips are named across nested forks: '${RepeatedTips<A> & string}' ends two arms`>;

/** What a stepper built with tip mappers hands out: the tip it ended in, under its name, mapped; one key at a time. */
export type TipResults<M> = {
  readonly [K in keyof M]?: M[K] extends (ctx: never) => infer R ? R : never;
};
