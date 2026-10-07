import { Signal, signal } from '@angular/core';
import { text, UiFormConfigBuilder } from 'formodel';
import { FormConfig } from '../../form';
import { isStepNode } from '../builder/flow';
import { StepperBuilder } from '../builder/stepper-builder';
import { SequenceNode } from '../types/flow';
import { RuntimeStepperContext } from '../types/step-context';
import { effectiveSteps } from './effective-sequence';

type One = { v: string };
const form = (label: string): FormConfig<One> => ({
  model: () => ({ v: '' }),
  ui: UiFormConfigBuilder.from({ v: '' }).v(text(label)),
});

// A page's heading is `Reactive<string>` - a value or a getter - so the assertion
// resolves it the way the controller does.
const headings = (steps: readonly SequenceNode[]) =>
  steps.filter(isStepNode).map((s) => {
    const pages = 'build' in s.pages ? s.pages.build(ctx({})) : s.pages;
    const heading = pages[0].options.heading;
    return typeof heading === 'function' ? heading() : heading;
  });

// Individual vs. business: two arms with their own state/forms/steps. They do not rejoin -
// there is no step after the fork - and the flow's egress is the chosen arm's committed
// steps under its key. The business arm forks again, so its egress is a union of its own.
const wizard = new StepperBuilder()
  .withState({ kind: '' as '' | 'individual' | 'business', seats: '' as '' | 'few' | 'many' })
  .createForm('start', form('Start'))
  .createStep((s) => s.createPage((p) => p.addForm('start'), { heading: 'Start' }), { name: 'start' })
  .fork((c) => c.shared.kind(), {
    individual: (arm) =>
      arm
        .withState({ ssn: '' })
        .createForm('person', form('Person'))
        .createStep((s) => s.createPage((p) => p.addForm('person'), { heading: 'Personal' }), { name: 'person' }),
    business: (arm) =>
      arm
        .withState({ vat: '' })
        .createForm('company', form('Company'))
        .createStep((s) => s.createPage((p) => p.addForm('company'), { heading: 'Company' }), { name: 'company' })
        .fork((c) => c.shared.seats(), {
          few: (inner) => inner.createStep((s) => s.createPage((p) => p.addForm('company'), { heading: 'Seats' }), { name: 'seats' }),
          many: (inner) => inner.createStep((s) => s.createPage((p) => p.addForm('company'), { heading: 'Fleet' }), { name: 'fleet' }),
        }),
  })
  .define();

function ctx(values: Record<string, unknown>): RuntimeStepperContext {
  const shared: Record<string, Signal<unknown>> = {};
  for (const [key, value] of Object.entries(values)) shared[key] = signal(value);

  return { steps: {}, shared, flow: undefined, parent: undefined };
}

const committed = {
  start: { start: { v: 'go' } },
  person: { person: { v: 'Ada' } },
  company: { company: { v: 'Acme' } },
  seats: { company: { v: '3' } },
};

describe('fork', () => {
  it('runs only the chosen arm’s steps — arms do not rejoin', () => {
    const everyStepEntered = () => true;
    expect(headings(effectiveSteps(wizard.stepSequenceNodes, ctx({ kind: 'individual' }), everyStepEntered))).toEqual(['Start', 'Personal']);
    expect(headings(effectiveSteps(wizard.stepSequenceNodes, ctx({ kind: 'business', seats: 'few' }), everyStepEntered))).toEqual([
      'Start',
      'Company',
      'Seats',
    ]);
  });

  it('merges every arm’s pool and state into the flow', () => {
    expect(Object.keys(wizard.forms)).toEqual(['start', 'person', 'company']);
    expect(wizard.sharedSeeds['ssn']).toBe('');
    expect(wizard.sharedSeeds['vat']).toBe('');
  });

  it('resolves the chosen arm’s committed steps under its key, and nothing from before the fork', () => {
    expect(wizard.resolveResult!(ctx({ kind: 'individual' }), committed)).toEqual({
      individual: { person: { person: { v: 'Ada' } } },
    });
  });

  it('nests a forking arm’s union under that arm’s key', () => {
    expect(wizard.resolveResult!(ctx({ kind: 'business', seats: 'few' }), committed)).toEqual({
      business: { few: { seats: { company: { v: '3' } } } },
    });
  });

  it('has no result before an arm is chosen', () => {
    expect(wizard.resolveResult!(ctx({ kind: '' }), committed)).toBeUndefined();
  });

  it('leaves out an arm step that has not committed yet', () => {
    expect(wizard.resolveResult!(ctx({ kind: 'individual' }), { start: committed.start })).toEqual({ individual: {} });
  });
});

// Step names and pool names are each one namespace across the whole wizard; the arms of a
// fork are inside it, so an arm may not repeat the parent's names or another arm's.
describe('fork - authoring errors', () => {
  const base = () =>
    new StepperBuilder()
      .withState({ kind: '' })
      .createForm('start', form('Start'))
      .createStep((s) => s.createPage((p) => p.addForm('start')), { name: 'start' });

  it('refuses an arm step named like a step before the fork', () => {
    expect(() =>
      base().fork((c) => c.shared.kind(), {
        a: (arm) => arm.createStep((s) => s.createPage((p) => p.addForm('start')), { name: 'start' }),
      }),
    ).toThrow(/already taken/);
  });

  it('refuses the same step name in two arms', () => {
    expect(() =>
      base().fork((c) => c.shared.kind(), {
        a: (arm) => arm.createStep((s) => s.createPage((p) => p.addForm('start')), { name: 'details' }),
        b: (arm) => arm.createStep((s) => s.createPage((p) => p.addForm('start')), { name: 'details' }),
      }),
    ).toThrow(/already taken/);
  });

  it('refuses an arm form named like one in the pool, or in another arm', () => {
    expect(() =>
      base().fork((c) => c.shared.kind(), {
        a: (arm) => arm.createForm('start', form('Again')),
      }),
    ).toThrow(/already taken/);

    expect(() =>
      base().fork((c) => c.shared.kind(), {
        a: (arm) => arm.createForm('extra', form('A')),
        b: (arm) => arm.createForm('extra', form('B')),
      }),
    ).toThrow(/already taken/);
  });
});
