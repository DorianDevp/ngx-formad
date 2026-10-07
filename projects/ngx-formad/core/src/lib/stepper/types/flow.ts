import { Provider, Signal } from '@angular/core';
import { ControlTypeMap } from '../../controls';
import { SharedSignals, StateOf, StateSeeds } from '../../shared';
import type { FlowInstance } from './flow-instance';
import { SequenceNodeKind, StepNode } from './nodes';
import { AnyFormProvider, BuiltSteps, DeferTrigger, RuntimeStepperContext } from './step-context';

/** The erased runtime shape of a flow: its sequence, form templates, shared store, control kinds and providers. */
export interface FlowDefinition<TResult = unknown> {
  readonly stepSequenceNodes: readonly SequenceNode[];

  readonly forms: Record<string, AnyFormProvider>;

  /** What `withState` seeded, as data; a built stepper makes its own `SharedState` of it. */
  readonly sharedSeeds: StateSeeds<Record<string, unknown>>;

  readonly controlTypes: ControlTypeMap;

  readonly providers: readonly Provider[];

  /**
   * What the flow hands out instead of its committed steps: a fork resolves the chosen arm's egress here, or nothing
   * while no arm is chosen. Asked over the live context (`ctx`, what gates and selectors read) and the committed
   * values so far, once the flow stands on its last step.
   */
  resolveResult?(ctx: RuntimeStepperContext, committed: RuntimeStepperContext['steps']): TResult | undefined;
}

/** A ring: pass steps, then the dock at `dockAt`; `fold` accumulates each finished pass into the state, which is also its result. */
export interface RecurrentFlowDefinition<C = unknown> extends FlowDefinition<C> {
  readonly recurrent: true;

  readonly dockAt: number;

  readonly state: () => C;

  fold?(state: C, pass: RuntimeStepperContext): C;

  dockReachable?(state: C): boolean;
}

/** Any flow the runtime drives. */
export type RuntimeFlow<TResult = unknown> = FlowDefinition<TResult> | RecurrentFlowDefinition<TResult>;

/**
 * A built flow: its shared store as read-only signals, its named steps' forms, and the instances behind them, which
 * also hold the flow it was built from. `TResult` is its egress - what it hands out when it completes and what a
 * parent reads under its slot's name: the committed steps of a linear flow, the chosen arm's egress of a fork, the
 * accumulator of a ring. The phantoms are carried by the type system, never read at runtime.
 */
export interface BuiltFlow<TForms = {}, TCtx extends RuntimeStepperContext = RuntimeStepperContext, TResult = unknown> {
  readonly __forms?: TForms;
  readonly __context?: TCtx;
  readonly __result?: TResult;
  readonly shared: SharedSignals<StateOf<TCtx['shared']>>;
  readonly steps: BuiltSteps<TCtx['steps']>;
  readonly instance: FlowInstance<TResult>;
}

/** A built ring: a flow whose egress is its accumulator. */
export interface BuiltRing<TForms = {}, TCtx extends RuntimeStepperContext = RuntimeStepperContext, C = unknown>
  extends BuiltFlow<TForms, TCtx, C> {
  readonly __recurrent: true;
}

/** A built flow with its authoring types erased. */
export type RuntimeStepper = BuiltFlow<unknown, RuntimeStepperContext, unknown>;

/** A nested flow occupying one slot of a sequence; its egress reaches successors under `name`. */
export interface FlowStepNode {
  readonly kind: SequenceNodeKind.Flow;

  readonly name: string;

  readonly flow: RuntimeFlow;

  readonly label?: Signal<string>;

  activeWhen?(ctx: RuntimeStepperContext): boolean;

  readonly defer?: DeferTrigger;

  completeWhen?(ctx: RuntimeStepperContext): boolean;

  readonly incompleteMessage?: string;
}

/** One slot of a sequence: a leaf step or a nested flow. */
export type SequenceNode = StepNode | FlowStepNode;
