import { UiFormConfigBuilder, text } from 'formodel';
import { FormConfig } from '../form-config/form-config';
import { isFlowStep, isRecurrent } from './flow';
import { SequenceNodeKind } from './nodes';
import { FlowContext, RuntimeStepContext } from './step-context';
import { RecurrentStepperBuilder, StepperBuilder } from './stepper-builder';
import { effectiveSteps } from '../runtime/effective-sequence';

type One = { v: string };

const form = (label: string): FormConfig<One> => ({
  model: () => ({ v: '' }),
  ui: UiFormConfigBuilder.from({ v: '' }).v(text(label)),
});

type Item = { name: string };

// A ring-context factory: the shape a recurrent controller supplies to its own
// steps' conditions, hand-built the way the pure specs already build contexts.
const ctx = (flow: FlowContext, shared: Record<string, unknown> = {}): RuntimeStepContext => ({
  shared,
  value: () => undefined,
  flow,
});

type Source = 'invoice' | 'manual';

const built = new StepperBuilder()
  .withState({ source: null as Source | null })
  .createForm('intro', form('Intro'))
  .createStep((s) => s.createPage({ options: { heading: 'Intro' } }, (p) => p.addForm((f) => f.intro)))
  .createRecurrentStepper(
    'devices',
    { collection: (): Item[] => [], label: 'Devices' },
    (loop) =>
      loop
        .withState({ draftName: '' })
        .createForm('name', form('Name'))
        .createForm('bulk', form('Bulk'))
        // The keys come straight from the shared field's type; null = no branch.
        .branch((c) => c.shared.source, {
          manual: (b) =>
            b.step((s) => s.createPage({ options: { heading: 'Name' } }, (p) => p.addForm((f) => f.name)), {
              label: 'Name',
            }),
          invoice: (b) =>
            b.step((s) => s.createPage({ options: { heading: 'Bulk' } }, (p) => p.addForm((f) => f.bulk)), {
              label: 'Bulk',
            }),
        })
        .completeWhen((items) => items.length > 0, 'Add at least one device')
        .dock((s) => s.createPage({ options: { heading: 'Collected' } }, (p) => p.addContent()), {
          label: 'Dock',
        }),
  )
  .build();

const flowNode = built.steps[1];

describe('createRecurrentStepper - the emitted node', () => {
  it('emits ONE flow node carrying the whole ring', () => {
    expect(built.steps.length).toBe(2);
    expect(flowNode.kind).toBe(SequenceNodeKind.Flow);
    if (!isFlowStep(flowNode)) throw new Error('expected a flow step');
    expect(flowNode.name).toBe('devices');
    expect(isRecurrent(flowNode.flow)).toBe(true);
  });

  it('does NOT merge the flow pool or state into the parent (the anti-fork rule)', () => {
    const parentPool = built.forms as Record<string, unknown>;
    expect(Object.keys(parentPool)).toEqual(['intro']);
    expect(() => built.shared.get('draftName' as never)).toThrow();
  });

  it('authors the dock last and records its position', () => {
    if (!isFlowStep(flowNode) || !isRecurrent(flowNode.flow)) throw new Error('not a ring');
    expect(flowNode.flow.dockAt).toBe(flowNode.flow.steps.length - 1);
  });

  it('mirrors the flow completeness onto the parent slot, seeded before any fold', () => {
    if (!isFlowStep(flowNode)) throw new Error('expected a flow step');
    const empty: RuntimeStepContext = { shared: {}, value: () => undefined };
    const one: RuntimeStepContext = { shared: {}, value: () => [{ name: 'a' }] };
    expect(flowNode.completeWhen?.(empty)).toBe(false);
    expect(flowNode.completeWhen?.(one)).toBe(true);
  });
});

describe('createRecurrentStepper - the ring gates', () => {
  const ring = isFlowStep(flowNode) && isRecurrent(flowNode.flow) ? flowNode.flow : null;

  it('shows exactly the dock while no pass is open', () => {
    const visible = effectiveSteps(ring!.steps, ctx({ collection: [], passOpen: false }));
    expect(visible.length).toBe(1);
    expect(visible[0]).toBe(ring!.steps[ring!.dockAt]);
  });

  it('shows exactly the chosen branch of the pass while a pass is open', () => {
    const manual = effectiveSteps(
      ring!.steps,
      ctx({ collection: [], passOpen: true }, { source: 'manual' }),
    );
    const invoice = effectiveSteps(
      ring!.steps,
      ctx({ collection: [], passOpen: true }, { source: 'invoice' }),
    );
    expect(manual.length).toBe(1);
    expect(invoice.length).toBe(1);
    expect(manual[0]).not.toBe(invoice[0]);
    expect(manual[0]).not.toBe(ring!.steps[ring!.dockAt]);
  });

  it('gates the dock completeness on the collection, with the authored message', () => {
    const dock = ring!.steps[ring!.dockAt];
    expect(dock.completeWhen?.(ctx({ collection: [], passOpen: false }))).toBe(false);
    expect(dock.completeWhen?.(ctx({ collection: [{ name: 'a' }], passOpen: false }))).toBe(true);
    expect(dock.incompleteMessage).toBe('Add at least one device');
  });
});

describe('Branching - the keys come from the type, absence is honest', () => {
  it('keeps every branch out of the sequence while the selector reports null', () => {
    const ring = isFlowStep(flowNode) && isRecurrent(flowNode.flow) ? flowNode.flow : null;
    const undecided = effectiveSteps(ring!.steps, ctx({ collection: [], passOpen: true }, { source: null }));

    expect(undecided.length).toBe(0);
  });
});

describe('RecurrentStepperBuilder - authoring errors', () => {
  it('refuses a pool name that is already taken, whatever kind claimed it', () => {
    expect(() =>
      new StepperBuilder()
        .createForm('devices', form('A'))
        .createRecurrentStepper(
          'devices',
          { collection: (): Item[] => [] },
          (loop) => loop.dock((s) => s.createPage({ options: {} }, (p) => p.addContent())),
        ),
    ).toThrow(/already taken/);

    expect(() =>
      new RecurrentStepperBuilder<{}, {}, Item[]>(() => [])
        .createForm('name', form('A'))
        .createForm('name', form('B')),
    ).toThrow(/already taken/);
  });


  it('refuses a pool name that is already taken, whatever kind claimed it', () => {
    expect(() =>
      new StepperBuilder()
        .createForm('devices', form('A'))
        .createRecurrentStepper(
          'devices',
          { collection: (): Item[] => [] },
          (loop) => loop.dock((s) => s.createPage({ options: {} }, (p) => p.addContent())),
        ),
    ).toThrow(/already taken/);

    expect(() =>
      new RecurrentStepperBuilder<{}, {}, Item[]>(() => [])
        .createForm('name', form('A'))
        .createForm('name', form('B')),
    ).toThrow(/already taken/);
  });


  it('refuses to build without a dock', () => {
    const dockless = new RecurrentStepperBuilder<{}, {}, Item[]>(() => []);
    expect(() => dockless._drain()).toThrow(/dock/);
  });

  it('refuses a second dock', () => {
    const loop = new RecurrentStepperBuilder<{}, {}, Item[]>(() => []);
    loop.dock((s) => s.createPage({ options: {} }, (p) => p.addContent()));
    expect(() =>
      loop.dock((s) => s.createPage({ options: {} }, (p) => p.addContent())),
    ).toThrow(/exactly one dock/);
  });
});
