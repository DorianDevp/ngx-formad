import { Signal, signal } from '@angular/core';
import { UiFormConfigBuilder, text } from 'formodel';
import { FormConfig } from '../form-config/form-config';
import { effectiveSteps } from '../runtime/effective-sequence';
import { isFlowStep, isRecurrent } from './flow';
import { SequenceNodeKind } from './nodes';
import { RuntimeStepContext, SharedSignals } from './step-context';
import { RecurrentStepperBuilder, StepperBuilder } from './stepper-builder';

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

  readonly steps?: RuntimeStepContext['steps'];
}

function ctx(ring: RingCtx): RuntimeStepContext {
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
    initial: (): Item[] => [],
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
        .completeWhen((items) => items.length > 0, 'Add at least one device')
        .dock((s) => s.createPage((p) => p.addContent((c) => c.p('Collected')), { heading: 'Collected' }), {
          label: 'Dock',
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

  it('mirrors the flow completeness onto the parent slot, from the initial state before any fold', () => {
    if (!isFlowStep(flowNode)) throw new Error('expected a flow step');
    const empty: RuntimeStepContext = { steps: {}, shared: {}, flow: undefined, parent: undefined };
    const one: RuntimeStepContext = {
      steps: { devices: [{ name: 'a' }] },
      shared: {},
      flow: undefined,
      parent: undefined,
    };
    expect(flowNode.completeWhen?.(empty)).toBe(false);
    expect(flowNode.completeWhen?.(one)).toBe(true);
  });
});

describe('createRecurrentStepper - the ring gates', () => {
  it('shows exactly the dock while no pass is open', () => {
    const visible = effectiveSteps(ring!.steps, ctx({ state: [], passOpen: false }));
    expect(visible.length).toBe(1);
    expect(visible[0]).toBe(ring!.steps[ring!.dockAt]);
  });

  it('shows exactly the chosen branch of the pass while a pass is open', () => {
    const manual = effectiveSteps(ring!.steps, ctx({ state: [], passOpen: true, values: { source: 'manual' } }));
    const invoice = effectiveSteps(ring!.steps, ctx({ state: [], passOpen: true, values: { source: 'invoice' } }));
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
    const undecided = effectiveSteps(ring!.steps, ctx({ state: [], passOpen: true, values: { source: null } }));

    expect(undecided.length).toBe(0);
  });
});

describe('RecurrentStepperBuilder - authoring errors', () => {
  it('refuses a pool name or a step name that is already taken on its level', () => {
    expect(() =>
      new RecurrentStepperBuilder<{}, Item[]>({ initial: () => [] })
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
          initial: (): Item[] => [],
          build: (loop) => loop.dock((s) => s.createPage((p) => p.addContent((c) => c.p('Collected')))),
        }),
    ).toThrow(/already taken/);
  });

  it('offers build() only after the dock', () => {
    const dockless = new RecurrentStepperBuilder<{}, Item[]>({ initial: () => [] });
    expect('build' in dockless).toBe(false);
  });

  it('refuses a second dock', () => {
    const loop = new RecurrentStepperBuilder<{}, Item[]>({ initial: () => [] });
    loop.dock((s) => s.createPage((p) => p.addContent((c) => c.p('Collected'))));
    expect(() =>
      loop.dock((s) => s.createPage((p) => p.addContent((c) => c.p('Collected')))),
    ).toThrow(/exactly one dock/);
  });
});
