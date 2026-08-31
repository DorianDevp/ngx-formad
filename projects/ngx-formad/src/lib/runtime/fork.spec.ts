import { UiFormConfigBuilder, text } from 'formodel';
import { isStepNode, SequenceNode } from '../builders/flow';
import { RuntimeStepContext } from '../builders/step-context';
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
    const heading = s.pages[0].options.heading;
    return typeof heading === 'function' ? heading() : heading;
  });

// Individual vs. business: two arms with their own state/forms/steps and their own
// typed result. They do not rejoin — there is no step after the fork.
const wizard = new StepperBuilder()
  .withState({ kind: '' as '' | 'individual' | 'business' })
  .createForm('start', form('Start'))
  .createStep((s) => s.createPage({ options: { heading: 'Start' } }, (p) => p.addForm((f) => f.start)))
  .fork((ctx) => ctx.shared.kind, {
    individual: (arm) =>
      arm
        .withState({ ssn: '' })
        .createForm('person', form('Person'))
        .createStep((s) => s.createPage({ options: { heading: 'Personal' } }, (p) => p.addForm((f) => f.person)))
        .result(({ shared }) => ({ kind: 'individual' as const, ssn: shared.ssn })),
    business: (arm) =>
      arm
        .withState({ vat: '' })
        .createForm('company', form('Company'))
        .createStep((s) => s.createPage({ options: { heading: 'Company' } }, (p) => p.addForm((f) => f.company)))
        .createStep((s) => s.createPage({ options: { heading: 'Seats' } }, (p) => p.addForm((f) => f.company)))
        .result(({ shared }) => ({ kind: 'business' as const, vat: shared.vat })),
  })
  .build();

function ctx(shared: Record<string, unknown>): RuntimeStepContext {
  return { shared, value: () => undefined };
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
