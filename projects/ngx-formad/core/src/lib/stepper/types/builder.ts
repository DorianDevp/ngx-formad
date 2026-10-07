import { Signal } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { FormBindings, FormContext, FormEffect, FormState } from '../../form';
import { Rejected } from '../../types';
import { SharedSignals } from '../../shared';
import { BuiltFlow, BuiltRing, FlowDefinition, RecurrentFlowDefinition } from './flow';
import { FormRevisit, StepRevisit } from './nodes';
import { FieldRefs, LinkPair, SharedSlots } from './shared-link';
import {
  DeferTrigger,
  FormModel,
  FormPlaced,
  FormUi,
  RecurrentSignals,
  RuntimeStepperContext,
  StepCondition,
  StepContext,
  StepperContext,
} from './step-context';

/** The control kinds every stepper starts with; `addControlType` refuses to redeclare one. */
export enum ControlKind {
  Text = 'text',
  Email = 'email',
  Password = 'password',
  Tel = 'tel',
  Url = 'url',
  Textarea = 'textarea',
  Number = 'number',
  Select = 'select',
  Radio = 'radio',
  Checkbox = 'checkbox',
  Date = 'date',
  File = 'file',
}

type UnionToIntersection<U> = (U extends U ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

/** `string` when `K` is a new kind; a refusal naming the clash when `TKinds` already has it. */
export type UnregisteredKind<TKinds extends string, K extends string> = K extends TKinds
  ? Rejected<`kind '${K}' is already registered; use overrideControlType`>
  : string;

/** `object` for a `FormValueControl` component class; a refusal naming the problem otherwise. */
export type ControlComponent<Cmp> = Cmp extends FormValueControl<infer _V>
  ? object
  : Rejected<'a control kind must be a FormValueControl component'>;

/** What a named step adds to the context: its instances, `| undefined` when gated by `activeWhen`. */
export type StepEntry<N extends string, Inst, O> = [N] extends [never]
  ? {}
  : Record<N, O extends { readonly activeWhen: infer _W } ? Inst | undefined : Inst>;

/** What an always-gated step adds: its instances or `undefined`. */
export type GatedEntry<N extends string, Inst> = [N] extends [never] ? {} : Record<N, Inst | undefined>;

/** An arm's entries as the steps after the branch see them: each possibly absent, since the arm may not run. */
export type Gated<T> = { readonly [K in keyof T]: T[K] | undefined };

/**
 * The values behind one entry: a step's instances become each form's model; anything else - a nested flow's egress,
 * a ring's accumulator - is already a value and passes through as it is.
 */
export type StepValues<Inst> = NonNullable<Inst> extends Record<string, FormState>
  ? { readonly [F in keyof NonNullable<Inst>]: NonNullable<Inst>[F] extends FormState<infer M> ? M : NonNullable<Inst>[F] }
  : NonNullable<Inst>;

/** A linear flow's egress: the named steps' values, each possibly absent. */
export type StepsCommitted<TSteps> = { readonly [K in keyof TSteps]?: StepValues<TSteps[K]> };

/** Placement options for a page content block. */
export interface ContentCfg<TCtx = unknown> {
  readonly layout?: string;

  readonly visibleWhen?: (ctx: TCtx) => boolean;
}

/** Placement options for a layout row; its gate takes the row's children with it. */
export interface RowCfg<TCtx = unknown> {
  readonly layout?: string;

  readonly visibleWhen?: (ctx: TCtx) => boolean;
}

/** A page as authored: its headings, its layout class and its own gate over the step context. */
export interface PageCfg<TCtx = unknown> {
  readonly heading?: string | Signal<string>;

  readonly subheading?: string | Signal<string>;

  readonly layout?: string;

  readonly visibleWhen?: (ctx: TCtx) => boolean;
}

/** The context a placed form's callbacks read: the step's level and the form's own. */
export type StepFormContext<F, TCtx extends RuntimeStepperContext, TForms = {}> = StepContext<TCtx, TForms> &
  FormContext<FormModel<F>, FormUi<F>>;

/** The bindings a placed form takes, typed by the pool template it names. */
export type PlacedFormBindings<F, TCtx extends RuntimeStepperContext> = FormBindings<
  FormModel<F>,
  FormUi<F>,
  FormPlaced<F>,
  StepFormContext<F, TCtx>
>;

/** Placement options for a pooled form: its field bindings, shared links, effects, the local `initial` seed and what a revisit does with it. */
export interface FormCfg<F, TCtx extends RuntimeStepperContext, TForms = {}> {
  readonly componentBindings?: PlacedFormBindings<F, TCtx>;
  readonly visibleWhen?: (ctx: StepContext<TCtx, TForms>) => boolean;
  readonly fieldValueBindings?: (
    fields: FieldRefs<FormModel<F>>,
    shared: SharedSlots<TCtx['shared']>,
  ) => readonly LinkPair[];
  readonly effects?: readonly FormEffect<StepFormContext<F, TCtx, TForms>>[];
  readonly initial?: (ctx: StepContext<TCtx, TForms>) => Partial<FormModel<F>>;
  readonly revisit?: FormRevisit;
}

/** When a step's pages are built: once, at authoring time, or again on every entry over the live context. */
export enum StepPages {
  Once = 'once',
  OnEntry = 'on-entry',
}

export const NOT_DYNAMIC = 'a step whose callback takes ctx must declare pages: StepPages.OnEntry';

/** The refusal a `(step, ctx)` callback meets when its step does not declare `pages: StepPages.OnEntry`. */
export type NotDynamic = Rejected<typeof NOT_DYNAMIC>;

/** Per-step config; `name` is the key successors read the step under, `pages` says when its pages are built. */
export interface StepCfg<TCtx extends RuntimeStepperContext, N extends string = never> {
  readonly name?: N;

  readonly pages?: StepPages;

  readonly label?: string | Signal<string>;

  readonly activeWhen?: StepCondition<TCtx>;

  readonly optional?: boolean;

  readonly defer?: DeferTrigger;

  readonly completeWhen?: StepCondition<TCtx>;

  readonly incompleteMessage?: string;

  readonly revisit?: StepRevisit;
}

/** The config of a step built once; `pages` may only say so. */
export type StaticStepCfg<TCtx extends RuntimeStepperContext, N extends string = never> = StepCfg<TCtx, N> & {
  readonly pages?: StepPages.Once;
};

/** The config of a step built on every entry; `pages: StepPages.OnEntry` is required. */
export type DynamicStepCfg<TCtx extends RuntimeStepperContext, N extends string = never> = StepCfg<TCtx, N> & {
  readonly pages: StepPages.OnEntry;
};

/** An arm selector: the arm's key, or null/undefined to select none. Asked once the steps before the arms are entered. */
export type BranchSelect<TCtx extends RuntimeStepperContext, K extends string> = (ctx: TCtx) => K | null | undefined;

/**
 * The contract every arm and every nested flow is authored to: something that defines a flow and builds into one. A
 * linear chain satisfies it, a fork returns it, so an arm may end in either. The level that nests or flattens it takes
 * the definition; `build()` is the stepper itself, its forms instantiated, and asks for an injection context.
 */
export interface Branch<TForms, TCtx extends RuntimeStepperContext, TResult> {
  define(): FlowDefinition<TResult>;
  build(): BuiltFlow<TForms, TCtx, TResult>;
}

/** Any branch, for a callback whose exact types are inferred at the call. */
export type AnyBranch = Branch<unknown, RuntimeStepperContext, unknown>;

/** A ring after `dock()`: its definition, for the level that nests it, and `build()`. */
export interface RecurrentTerminal<TForms, TCtx extends RuntimeStepperContext, C> {
  define(): RecurrentFlowDefinition<C>;
  build(): BuiltRing<TForms, TCtx, C>;
}

// The types below read a built flow by its phantoms alone: matched against the whole `BuiltFlow`, a context still
// generic in its parent is inferred through `steps` and `shared` as well, which loses the entries an arm added.

/** What a branch, or a built flow, hands out when it completes. */
export type Egress<B> = B extends { build(): { readonly __result?: infer R } }
  ? R
  : B extends { readonly __result?: infer R }
    ? R
    : never;

/** The context an arm callback ends with. */
export type ArmContext<Fn> = Fn extends (arm: never) => {
  build(): { readonly __context?: infer C extends RuntimeStepperContext };
}
  ? C
  : never;

/** The egress an arm callback ends with. */
export type ArmResult<Fn> = Fn extends (arm: never) => { build(): { readonly __result?: infer R } } ? R : never;

/** A fork's egress: the chosen arm's egress under its key, `{ a: Ea } | { b: Eb }`; a nested fork nests its union. */
export type ForkResult<A> = { [K in keyof A]: { readonly [P in K]: ArmResult<A[K]> } }[keyof A];

/** The entries an arm adds beyond the level it was authored on, each possibly absent, since the arm may not run. */
type ArmAdded<Fn, TCtx extends RuntimeStepperContext> = {
  readonly [N in Exclude<keyof ArmContext<Fn>['steps'], keyof TCtx['steps']>]: ArmContext<Fn>['steps'][N] | undefined;
};

/** What the arms of a `branch` add once they rejoin: every arm's new entries, merged. */
export type BranchAdded<A, TCtx extends RuntimeStepperContext> = UnionToIntersection<{ [K in keyof A]: ArmAdded<A[K], TCtx> }[keyof A]>;

/** The committed record of a built flow, for narrowing `stepCommitted` once at the boundary. */
export type CommittedOf<S> = S extends { readonly __context?: infer TCtx extends RuntimeStepperContext }
  ? StepsCommitted<TCtx['steps']>
  : never;

/** The authoring types every builder carries as phantoms. */
export interface BuilderShape<TForms, TKinds extends string, TCtx extends RuntimeStepperContext> {
  readonly __forms?: TForms;

  readonly __kinds?: TKinds;

  readonly __context?: TCtx;
}

/** The pool a builder has declared. */
export type FormsOf<B> = B extends BuilderShape<infer F, infer _K, infer _C> ? F : never;

/** The control kinds a builder knows. */
export type KindsOf<B> = B extends BuilderShape<infer _F, infer K, infer _C> ? K : never;

/** The context a builder's next step reads. */
export type ContextOf<B> = B extends BuilderShape<infer _F, infer _K, infer C> ? C : never;

/** The parent-side options of a nested flow slot. */
export interface FlowSlotCfg<TCtx extends RuntimeStepperContext> {
  readonly label?: string | Signal<string>;

  readonly activeWhen?: StepCondition<TCtx>;

  readonly defer?: DeferTrigger;
}

/** A ring's accumulator: the state it starts from and, optionally, when the dock counts as reachable. */
export interface RingCfg<C> {
  readonly state: () => C;

  readonly dockReachable?: (state: C) => boolean;
}

/**
 * The dock's own config. The dock is the ring's terminal - the only way out - so nothing gates it away (`activeWhen`),
 * nothing skips it (`optional`) and it is not rebuilt behind the user's back (`revisit`); its `completeWhen` is the
 * flow's contract, read over `ctx.flow.state()`.
 */
export type DockCfg<TCtx extends RuntimeStepperContext, N extends string = never> = Omit<
  StepCfg<TCtx, N>,
  'activeWhen' | 'optional' | 'revisit'
>;

/** The runtime shape of every context inside a ring over `C`. */
export type RingRuntimeContext<C> = StepperContext<
  SharedSignals,
  RuntimeStepperContext['steps'],
  RuntimeStepperContext['parent'],
  RecurrentSignals<C>
>;
