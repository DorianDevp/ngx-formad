import { signal } from '@angular/core';
import { RecurrentFlowDefinition } from '../types/flow';
import { PassRecord } from '../types/pass-record';
import { RuntimeStepperContext } from '../types/step-context';
import { FlowRing } from './flow-ring';

type Item = { readonly name: string };

function ringHearing(heard: Item[][]): FlowRing<Item[]> {
  const definition: RecurrentFlowDefinition<Item[]> = {
    recurrent: true,
    dockAt: 0,
    stepSequenceNodes: [],
    forms: {},
    sharedSeeds: {},
    controlTypes: {},
    providers: [],
    state: () => [],
    fold: (state, pass) => [...state, { name: String(pass.shared['next']?.()) }],
    onState: (state) => heard.push(state),
  };

  return new FlowRing(definition);
}

const pass = (name: string): RuntimeStepperContext => ({
  steps: {},
  shared: { next: signal(name) },
  flow: undefined,
  parent: undefined,
});

const record = {} as PassRecord;

describe('FlowRing onState', () => {
  it('hears each change someone makes, as the pass sees the state, and nothing else', () => {
    const heard: Item[][] = [];
    const ring = ringHearing(heard);
    expect(heard).toEqual([]);

    ring.openPass();
    ring.fold(pass('a'), record);
    ring.openPass();
    ring.fold(pass('b'), record);
    expect(heard.map((state) => state.map((item) => item.name))).toEqual([['a'], ['a', 'b']]);

    const [a] = ring.entries();
    ring.reopen({ entry: a, index: 0 } as never);
    expect(heard.at(-1)?.map((item) => item.name)).toEqual(['b']);

    ring.abandonPass();
    expect(heard.at(-1)?.map((item) => item.name)).toEqual(['a', 'b']);

    ring.amend((state) => state.filter((item) => item.name !== 'b'));
    expect(heard.at(-1)?.map((item) => item.name)).toEqual(['a']);

    const count = heard.length;
    ring.amend((state) => state);
    ring.reset();
    expect(heard.length).toBe(count);
  });
});
