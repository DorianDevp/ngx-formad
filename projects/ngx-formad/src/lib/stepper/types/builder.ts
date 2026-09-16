import { Signal } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { FormBindings, FormContext, FormEffect, FormState } from '../../form';
import { SharedState } from '../../shared';
import { Rejected } from '../../types';
import { SequenceNode } from './flow';
import { FormRevisit, StepRevisit } from './nodes';
import { FieldRefs, LinkPair, SharedSlots } from './shared-link';
import {
  AnyFormProvider,
  DeferTrigger,
  FormModel,
  FormPlaced,
  FormUi,
  RecurrentSignals,
  RuntimeStepperContext,
  SharedSignals,
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

type UnionToIntersection<U> = (U extends U ? (k: U) => void : never) extends (k: infer I) => void
  ? I
  : never;

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

/** The values behind one step's instances: each form's model. */
export type StepValues<Inst> = {
  readonly [F in keyof NonNullable<Inst>]: NonNullable<Inst>[F] extends FormState<infer M>
    ? M
    : NonNullable<Inst>[F];
};

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

/** A branch selector: the branch key, or null/undefined to select no arm. Asked once the steps before the branch are entered. */
export type BranchSelect<TCtx extends RuntimeStepperContext, K extends string> = (ctx: TCtx) => K | null | undefined;

/** The entries every arm of a `branch` adds, merged. */
export type BranchAdded<B> = UnionToIntersection<
  { [K in keyof B]: B[K] extends (b: never) => { __added?: infer A } ? A : never }[keyof B]
>;

/** What a fork arm accumulates while it is authored: its pool, its state slice and its steps. */
export interface ArmState {
  readonly forms: Readonly<Record<string, AnyFormProvider>>;

  readonly shared: SharedState;

  readonly steps: readonly SequenceNode[];
}

/** One finished fork arm: its pool, state slice, steps and typed result resolver. */
export interface ForkArm<R = unknown> extends ArmState {
  readonly __result?: R;

  resolve(ctx: RuntimeStepperContext): R;
}

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
