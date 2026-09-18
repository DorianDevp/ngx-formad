import { Signal, signal } from '@angular/core';
import { UiFormConfigBuilder, text } from 'formodel';
import { FormConfig } from '../../form';
import { effectiveSteps } from '../runtime/effective-sequence';
import { SequenceNodeKind } from '../types/nodes';
import { RuntimeStepperContext, SharedSignals } from '../types/step-context';
import { isFlowStep, isRecurrent, isStepNode } from './flow';
import { RecurrentStepperBuilder } from './recurrent-stepper-builder';
import { StepperBuilder } from './stepper-builder';

type One = { v: string };

const form = (label: string): FormConfig<One> => ({
  model: () => ({ v: '' }),
  ui: UiFormConfigBuilder.from({ v: '' }).v(text(label)),
});

type Item = { name: string };

interface RingCtx {
  readonly state: Item[];

  readonly passOpen: boolean;

  readonly values?: Record<string, SharedSignals[string] extends Signal<infer V> ? V : never>;

  readonly steps?: RuntimeStepperContext['steps'];
}

function ctx(ring: RingCtx): RuntimeStepperContext {
  const shared: Record<string, SharedSignals[string]> = {};
  for (const [key, value] of Object.entries(ring.values ?? {})) shared[key] = signal(value);

  return {
    steps: ring.steps ?? {},
    shared,
    flow: { state: signal(ring.state), passOpen: signal(ring.passOpen) },
    parent: undefined,
  };
}

type Source = 'invoice' | 'manual';

const built = new StepperBuilder()
  .withState({ source: null as Source | null })
  .createForm('intro', form('Intro'))
  .createStep((s) => s.createPage((p) => p.addForm('intro'), { heading: 'Intro' }))
  .createRecurrentStepper('devices', {
    state: (): Item[] => [],
    label: 'Devices',
    build: (loop) =>
      loop
        .withState({ draftName: '' })
        .createForm('name', form('Name'))
        .createForm('bulk', form('Bulk'))
        .branch((c) => c.shared.source(), {
          manual: (b) =>
            b.createStep((s) => s.createPage((p) => p.addForm('name'), { heading: 'Name' }), {
              label: 'Name',
            }),
          invoice: (b) =>
            b.createStep((s) => s.createPage((p) => p.addForm('bulk'), { heading: 'Bulk' }), {
              label: 'Bulk',
            }),
        })
        .dock((s) => s.createPage((p) => p.addContent((c) => c.p('Collected')), { heading: 'Collected' }), {
          label: 'Dock',
          completeWhen: (ctx) => ctx.flow.state().length > 0,
          incompleteMessage: 'Add at least one device',
        }),
  })
  .build();

const flowNode = built.steps[1];

const ring = isFlowStep(flowNode) && isRecurrent(flowNode.flow) ? flowNode.flow : null;

describe('createRecurrentStepper - the emitted node', () => {
  it('emits ONE flow node carrying the whole ring', () => {
    expect(built.steps.length).toBe(2);
    expect(flowNode.kind).toBe(SequenceNodeKind.Flow);
    if (!isFlowStep(flowNode)) throw new Error('expected a flow step');
    expect(flowNode.name).toBe('devices');
    expect(isRecurrent(flowNode.flow)).toBe(true);
  });

  it('does NOT merge the flow pool or state into the parent', () => {
    expect(Object.keys(built.forms)).toEqual(['intro']);
    expect(() => built.shared.get('draftName' as never)).toThrow();
  });

  it('authors the dock last and records its position', () => {
    expect(ring?.dockAt).toBe((ring?.steps.length ?? 0) - 1);
  });

  // The flow's contract is its dock's business: the ring has no exit but the dock, and the
  // dock's own completeWhen holds it, so the parent slot carries no guard of its own.
  it('leaves the parent slot ungated and keeps the contract on the dock', () => {
    if (!isFlowStep(flowNode)) throw new Error('expected a flow step');
    expect(flowNode.completeWhen).toBeUndefined();
    expect(flowNode.incompleteMessage).toBeUndefined();

    const dock = ring?.steps[ring.dockAt];
    if (!dock || !isStepNode(dock)) throw new Error('expected a leaf dock');
    expect(dock.incompleteMessage).toBe('Add at least one device');
    expect(dock.completeWhen?.(ctx({ state: [{ name: 'a' }], passOpen: false }))).toBe(true);
    expect(dock.completeWhen?.(ctx({ state: [], passOpen: false }))).toBe(false);
  });
});

// The pure walk over a ring every step of which has been entered: the gates alone decide.
const everyStepEntered = () => true;

describe('createRecurrentStepper - the ring gates', () => {
  it('shows exactly the dock while no pass is open', () => {
    const visible = effectiveSteps(ring!.steps, ctx({ state: [], passOpen: false }), everyStepEntered);
    expect(visible.length).toBe(1);
    expect(visible[0]).toBe(ring!.steps[ring!.dockAt]);
  });

  it('shows exactly the chosen branch of the pass while a pass is open', () => {
    const manual = effectiveSteps(ring!.steps, ctx({ state: [], passOpen: true, values: { source: 'manual' } }), everyStepEntered);
    const invoice = effectiveSteps(ring!.steps, ctx({ state: [], passOpen: true, values: { source: 'invoice' } }), everyStepEntered);
    expect(manual.length).toBe(1);
    expect(invoice.length).toBe(1);
    expect(manual[0]).not.toBe(invoice[0]);
    expect(manual[0]).not.toBe(ring!.steps[ring!.dockAt]);
  });

  it('gates the dock completeness on the state, with the authored message', () => {
    const dock = ring!.steps[ring!.dockAt];
    expect(dock.completeWhen?.(ctx({ state: [], passOpen: false }))).toBe(false);
    expect(dock.completeWhen?.(ctx({ state: [{ name: 'a' }], passOpen: false }))).toBe(true);
    expect(dock.incompleteMessage).toBe('Add at least one device');
  });

  it('keeps every branch out of the sequence while the selector reports null', () => {
    const undecided = effectiveSteps(ring!.steps, ctx({ state: [], passOpen: true, values: { source: null } }), everyStepEntered);

    expect(undecided.length).toBe(0);
  });
});

describe('RecurrentStepperBuilder - authoring errors', () => {
  it('refuses a pool name or a step name that is already taken on its level', () => {
    expect(() =>
      new RecurrentStepperBuilder<{}, Item[]>({ state: () => [] })
        .createForm('name', form('A'))
        .createForm('name', form('B')),
    ).toThrow(/already taken/);

    expect(() =>
      new StepperBuilder()
        .createForm('intro', form('A'))
        .createStep((s) => s.createPage((p) => p.addForm('intro')), {
          name: 'devices',
        })
        .createRecurrentStepper('devices', {
          state: (): Item[] => [],
          build: (loop) => loop.dock((s) => s.createPage((p) => p.addContent((c) => c.p('Collected')))),
        }),
    ).toThrow(/already taken/);
  });

  it('offers build() only after the dock', () => {
    const dockless = new RecurrentStepperBuilder<{}, Item[]>({ state: () => [] });
    expect('build' in dockless).toBe(false);
  });

  it('refuses a second dock', () => {
    const loop = new RecurrentStepperBuilder<{}, Item[]>({ state: () => [] });
    loop.dock((s) => s.createPage((p) => p.addContent((c) => c.p('Collected'))));
    expect(() =>
      loop.dock((s) => s.createPage((p) => p.addContent((c) => c.p('Collected')))),
    ).toThrow(/exactly one dock/);
  });
});
