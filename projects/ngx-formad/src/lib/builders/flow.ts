import { ControlTypeMap } from '../provide';
import { SharedState } from '../sync/shared-state';
import { Reactive } from './dynamic-component';
import { SequenceNodeKind, StepNode } from './nodes';
import {
  AnyControlEntry,
  AnyFormProvider,
  DeferTrigger,
  RuntimeResultResolver,
  RuntimeStepCondition,
  RuntimeStepContext,
} from './step-context';
import { FlowPort } from './flow-port';

// A flow is the runtime shape both abstractions share: a linear `Stepper` and a
// `RecurrentStepper` (a ring around a dock) are each "a sequence with its own form
// pool and its own shared store". Either can be the root handed to
// `<ngx-formad-stepper>`, and either can occupy ONE slot of another flow's
// sequence (a `FlowStepNode`) — the recursion the controller drives with one
// child controller per flow step, all rendered by the single root chrome.

/** The erased runtime shape of any flow — what the controller consumes. A built
 *  `Stepper`, erased with `asStepper`, satisfies this structurally. */
export interface FlowDefinition {
  readonly steps: readonly SequenceNode[];

  readonly forms: Record<string, AnyFormProvider>;

  readonly controls: Record<string, AnyControlEntry>;

  readonly shared: SharedState<Record<string, unknown>>;

  readonly controlTypes: ControlTypeMap;

  /** Set by `fork` on a root stepper; nested flows have no fork. */
  readonly resolveResult?: RuntimeResultResolver;
}

/** A recurrent flow: pass steps authored first, the dock last. State is the
 *  flow's own — the collection accumulates by a pure fold from each finished
 *  pass, and nothing outside the flow mutates it. Generic in its collection;
 *  the runtime consumes the one erased instantiation, {@link RuntimeFlow}. */
export interface RecurrentFlowDefinition<C = unknown> extends FlowDefinition {
  readonly recurrent: true;

  /** Index of the dock in `steps`. */
  readonly dockAt: number;

  /** A fresh collection — the accumulator's starting value. */
  readonly seed: () => C;

  /** Pure: (collection so far, the finished pass's context) → new collection.
   *  The context carries the pass's committed `value(...)` reads and its shared
   *  snapshot, so one signature covers a one-item pass and a many-item pass. */
  readonly fold?: (collection: C, pass: RuntimeStepContext) => C;

  /** True when the collection is non-empty — entry lands on the dock, and Back on
   *  the pass's first step returns to the dock instead of leaving the flow. */
  readonly hasAny: (collection: C) => boolean;

  /** The flow's validity, derived from the collection and nothing else. */
  readonly complete?: (collection: C) => boolean;

  readonly incompleteMessage?: string;

  /** The authoring-time handle components read the collection through. Bound to
   *  the live runtime by the controller. */
  readonly port: FlowPort<C>;
}

/** Any flow the runtime can drive. The single, named place a recurrent flow's
 *  collection type is erased. */
export type RuntimeFlow = FlowDefinition | RecurrentFlowDefinition;

/** A nested flow occupying one slot of a sequence. It has no pages of its own —
 *  what renders is the flow's active leaf, through a child controller. */
export interface FlowStepNode {
  readonly kind: SequenceNodeKind.Flow;

  /** The pool name the flow's value commits under in the PARENT's committed map:
   *  a recurrent flow's collection, a linear sub-flow's committed record. */
  readonly name: string;

  readonly flow: RuntimeFlow;

  readonly label?: Reactive<string>;

  readonly when?: RuntimeStepCondition;

  readonly defer?: DeferTrigger;

  /** Mirrors the flow's own completeness — the parent-side gate for a host that
   *  navigates past the flow without going through its dock. */
  readonly completeWhen?: RuntimeStepCondition;

  readonly incompleteMessage?: string;
}

/** One slot of a flow's sequence: a leaf step, or a nested flow. */
export type SequenceNode = StepNode | FlowStepNode;

export function isFlowStep(node: SequenceNode): node is FlowStepNode {
  return node.kind === SequenceNodeKind.Flow;
}

export function isRecurrent(flow: RuntimeFlow): flow is RecurrentFlowDefinition {
  return 'recurrent' in flow && flow.recurrent;
}

export function isStepNode(node: SequenceNode): node is StepNode {
  return node.kind === SequenceNodeKind.Step;
}
