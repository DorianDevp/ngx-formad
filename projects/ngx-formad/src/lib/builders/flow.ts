import { Provider } from '@angular/core';
import { ControlTypeMap } from '../provide';
import { SharedState } from '../sync/shared-state';
import { Reactive } from './dynamic-component';
import { SequenceNodeKind, StepNode } from './nodes';
import {
  AnyFormProvider,
  DeferTrigger,
  ErasedRecord,
  RuntimeResultResolver,
  RuntimeStepCondition,
  RuntimeStepContext,
} from './step-context';

/** The erased runtime shape of a flow: its sequence, form templates, shared store, control kinds and providers. */
export interface FlowDefinition {
  readonly steps: readonly SequenceNode[];

  readonly forms: Record<string, AnyFormProvider>;

  readonly shared: SharedState<ErasedRecord>;

  readonly controlTypes: ControlTypeMap;

  readonly providers: readonly Provider[];

  readonly resolveResult?: RuntimeResultResolver;
}

/** A ring: pass steps, then the dock at `dockAt`; `fold` accumulates each finished pass into the state. */
export interface RecurrentFlowDefinition<C = unknown> extends FlowDefinition {
  readonly recurrent: true;

  readonly dockAt: number;

  readonly initial: () => C;

  readonly fold?: (state: C, pass: RuntimeStepContext) => C;

  readonly dockReachable?: (state: C) => boolean;

  readonly complete?: (state: C) => boolean;

  readonly incompleteMessage?: string;
}

/** Any flow the runtime drives; the ring's state type is erased here. */
export type RuntimeFlow = FlowDefinition | RecurrentFlowDefinition;

/** A nested flow occupying one slot of a sequence; its egress reaches successors under `name`. */
export interface FlowStepNode {
  readonly kind: SequenceNodeKind.Flow;

  readonly name: string;

  readonly flow: RuntimeFlow;

  readonly label?: Reactive<string>;

  readonly when?: RuntimeStepCondition;

  readonly defer?: DeferTrigger;

  readonly completeWhen?: RuntimeStepCondition;

  readonly incompleteMessage?: string;
}

/** One slot of a sequence: a leaf step or a nested flow. */
export type SequenceNode = StepNode | FlowStepNode;

/** Narrows a sequence node to a nested flow. */
export function isFlowStep(node: SequenceNode): node is FlowStepNode {
  return node.kind === SequenceNodeKind.Flow;
}

/** Narrows a runtime flow to a ring. */
export function isRecurrent(flow: RuntimeFlow): flow is RecurrentFlowDefinition {
  return 'recurrent' in flow && flow.recurrent;
}

/** Narrows a sequence node to a leaf step. */
export function isStepNode(node: SequenceNode): node is StepNode {
  return node.kind === SequenceNodeKind.Step;
}
