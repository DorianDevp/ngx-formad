import { FlowStepNode, RecurrentFlowDefinition, RuntimeFlow, SequenceNode } from '../types/flow';
import { SequenceNodeKind, StepNode } from '../types/nodes';

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
