import { Provider, Signal } from '@angular/core';
import { ControlTypeMap } from '../provide';
import { SharedState } from '../sync/shared-state';
import { SequenceNodeKind, StepNode } from './nodes';
import { AnyFormProvider, DeferTrigger, RuntimeStepContext } from './step-context';

/** The erased runtime shape of a flow: its sequence, form templates, shared store, control kinds and providers. */
export interface FlowDefinition<TResult = unknown> {
  readonly steps: readonly SequenceNode[];

  readonly forms: Record<string, AnyFormProvider>;

  readonly shared: SharedState;

  readonly controlTypes: ControlTypeMap;

  readonly providers: readonly Provider[];

  resolveResult?(ctx: RuntimeStepContext): TResult;
}

/** A ring: pass steps, then the dock at `dockAt`; `fold` accumulates each finished pass into the state, which is also its result. */
export interface RecurrentFlowDefinition<C = unknown> extends FlowDefinition<C> {
  readonly recurrent: true;

  readonly dockAt: number;

  readonly initial: () => C;

  fold?(state: C, pass: RuntimeStepContext): C;

  dockReachable?(state: C): boolean;

  complete?(state: C): boolean;

  readonly incompleteMessage?: string;
}

/** Any flow the runtime drives. */
export type RuntimeFlow<TResult = unknown> = FlowDefinition<TResult> | RecurrentFlowDefinition<TResult>;

/** A nested flow occupying one slot of a sequence; its egress reaches successors under `name`. */
export interface FlowStepNode {
  readonly kind: SequenceNodeKind.Flow;

  readonly name: string;

  readonly flow: RuntimeFlow;

  readonly label?: Signal<string>;

  when?(ctx: RuntimeStepContext): boolean;

  readonly defer?: DeferTrigger;

  completeWhen?(ctx: RuntimeStepContext): boolean;

  readonly incompleteMessage?: string;
}

/** One slot of a sequence: a leaf step or a nested flow. */
export type SequenceNode = StepNode | FlowStepNode;

/** Narrows a sequence node to a nested flow. */
export function isFlowStep(node: SequenceNode): node is FlowStepNode {
  return node.kind === SequenceNodeKind.Flow;
}

/** Narrows a runtime flow to a ring. */
export function isRecurrent<TResult>(flow: RuntimeFlow<TResult>): flow is RecurrentFlowDefinition<TResult> {
  return 'recurrent' in flow && flow.recurrent;
}

/** Narrows a sequence node to a leaf step. */
export function isStepNode(node: SequenceNode): node is StepNode {
  return node.kind === SequenceNodeKind.Step;
}
