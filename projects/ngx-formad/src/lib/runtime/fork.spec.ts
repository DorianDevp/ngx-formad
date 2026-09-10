import { UiFormConfigBuilder, text } from 'formodel';
import { isStepNode, SequenceNode } from '../builders/flow';
import { Signal, signal } from '@angular/core';
import { RuntimeStepperContext } from '../builders/step-context';
import { StepperBuilder } from '../builders/stepper-builder';
import { FormConfig } from '../form-config/form-config';
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

// Individual vs. business: two arms with their own state/forms/steps and their own
// typed result. They do not rejoin — there is no step after the fork.
const wizard = new StepperBuilder()
  .withState({ kind: '' as '' | 'individual' | 'business' })
  .createForm('start', form('Start'))
  .createStep((s) => s.createPage((p) => p.addForm('start'), { heading: 'Start' }))
  .fork((c) => c.shared.kind(), {
    individual: (arm) =>
      arm
        .withState({ ssn: '' })
        .createForm('person', form('Person'))
        .createStep((s) => s.createPage((p) => p.addForm('person'), { heading: 'Personal' }))
        .result(({ shared }) => ({ kind: 'individual' as const, ssn: shared.ssn() })),
    business: (arm) =>
      arm
        .withState({ vat: '' })
        .createForm('company', form('Company'))
        .createStep((s) => s.createPage((p) => p.addForm('company'), { heading: 'Company' }))
        .createStep((s) => s.createPage((p) => p.addForm('company'), { heading: 'Seats' }))
        .result(({ shared }) => ({ kind: 'business' as const, vat: shared.vat() })),
  })
  .build();

function ctx(values: Record<string, unknown>): RuntimeStepperContext {
  const shared: Record<string, Signal<unknown>> = {};
  for (const [key, value] of Object.entries(values)) shared[key] = signal(value);

  return { steps: {}, shared, flow: undefined, parent: undefined };
}

describe('fork', () => {
  it('runs only the chosen arm’s steps — arms do not rejoin', () => {
    expect(headings(effectiveSteps(wizard.steps, ctx({ kind: 'individual' })))).toEqual(['Start', 'Personal']);
    expect(headings(effectiveSteps(wizard.steps, ctx({ kind: 'business' })))).toEqual([
      'Start',
      'Company',
      'Seats',
    ]);
  });

  it('resolves the active arm’s discriminated, typed result', () => {
    expect(wizard.resolveResult!(ctx({ kind: 'individual', ssn: '123' }))).toEqual({
      kind: 'individual',
      ssn: '123',
    });
    expect(wizard.resolveResult!(ctx({ kind: 'business', vat: 'PL9' }))).toEqual({
      kind: 'business',
      vat: 'PL9',
    });
  });

  it('has no result before an arm is chosen', () => {
    expect(wizard.resolveResult!(ctx({ kind: '' }))).toBeUndefined();
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
        a: (arm) => arm.createStep((s) => s.createPage((p) => p.addForm('start')), { name: 'start' }).result(() => 'a'),
      }),
    ).toThrow(/already taken/);
  });

  it('refuses the same step name in two arms', () => {
    expect(() =>
      base().fork((c) => c.shared.kind(), {
        a: (arm) => arm.createStep((s) => s.createPage((p) => p.addForm('start')), { name: 'details' }).result(() => 'a'),
        b: (arm) => arm.createStep((s) => s.createPage((p) => p.addForm('start')), { name: 'details' }).result(() => 'b'),
      }),
    ).toThrow(/already taken/);
  });

  it('refuses an arm form named like one in the pool, or in another arm', () => {
    expect(() =>
      base().fork((c) => c.shared.kind(), {
        a: (arm) => arm.createForm('start', form('Again')).result(() => 'a'),
      }),
    ).toThrow(/already taken/);

    expect(() =>
      base().fork((c) => c.shared.kind(), {
        a: (arm) => arm.createForm('extra', form('A')).result(() => 'a'),
        b: (arm) => arm.createForm('extra', form('B')).result(() => 'b'),
      }),
    ).toThrow(/already taken/);
  });
});
