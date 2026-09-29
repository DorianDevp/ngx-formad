import { SharedState } from '../../shared';
import { Arm, ChainState } from '../types/chain';
import { FlowDefinition, SequenceNode } from '../types/flow';
import { AnyFormProvider, StepGate } from '../types/step-context';
import { guardedBy } from './step-builder';

export const EMPTY_CHAIN: ChainState = {
  forms: {},
  shared: new SharedState({}),
  steps: [],
  controlTypes: {},
  providers: [],
  stepNames: {},
};

/** Refuses a name a form or a step already took at this level. */
export function claimName(name: string, taken: object): void {
  if (Object.hasOwn(taken, name)) throw new Error(`The name '${name}' is already taken.`);
}

function claimedStep(taken: Readonly<Record<string, true>>, node: SequenceNode): Readonly<Record<string, true>> {
  if (node.name === undefined) return taken;
  claimName(node.name, taken);

  return { ...taken, [node.name]: true };
}

function claimedForm(
  taken: Readonly<Record<string, AnyFormProvider>>,
  [name, provider]: readonly [string, AnyFormProvider],
): Readonly<Record<string, AnyFormProvider>> {
  claimName(name, taken);

  return { ...taken, [name]: provider };
}

/** The chain with nodes appended; a named node claims its name on this level. */
export function appended(chain: ChainState, nodes: readonly SequenceNode[]): ChainState {
  return {
    ...chain,
    steps: [...chain.steps, ...nodes],
    stepNames: nodes.reduce(claimedStep, chain.stepNames),
  };
}

/**
 * The chain with every arm flattened into it, each arm's nodes under the gate its key earns. Names are one namespace
 * across the level, so an arm may repeat neither the chain's names nor another arm's.
 */
export function merged(chain: ChainState, arms: readonly Arm[], gateFor: (key: string) => StepGate): ChainState {
  return arms.reduce<ChainState>((into, { key, flow }) => {
    const gate = gateFor(key);
    const steps = flow.steps.map((node) => guardedBy(gate, node));

    return {
      forms: Object.entries(flow.forms).reduce(claimedForm, into.forms),
      shared: new SharedState({ ...into.shared.seeds(), ...flow.shared.seeds() }),
      steps: [...into.steps, ...steps],
      controlTypes: { ...into.controlTypes, ...flow.controlTypes },
      providers: [...into.providers, ...flow.providers],
      stepNames: steps.reduce(claimedStep, into.stepNames),
    };
  }, chain);
}

/** The erased flow a chain freezes into. It resolves nothing of its own: `resolveResult` is a fork's to add. */
export function definitionOf(chain: ChainState): FlowDefinition<never> {
  return {
    forms: chain.forms,
    steps: chain.steps,
    shared: chain.shared,
    controlTypes: chain.controlTypes,
    providers: chain.providers,
  };
}

type Resolve = NonNullable<FlowDefinition['resolveResult']>;

/**
 * The egress of a flattened arm: its own resolver when it forks, otherwise its named steps picked out of the committed
 * record of the level it was flattened into.
 */
export function egressOf(arm: FlowDefinition): Resolve {
  const resolve = arm.resolveResult;
  if (resolve) return (ctx, committed) => resolve(ctx, committed);

  const names = arm.steps.flatMap((node) => (node.name === undefined ? [] : [node.name]));

  return (_ctx, committed) =>
    Object.fromEntries(names.filter((name) => Object.hasOwn(committed, name)).map((name) => [name, committed[name]]));
}
