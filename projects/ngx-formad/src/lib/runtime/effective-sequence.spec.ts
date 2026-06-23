import { UiFormConfigBuilder, text } from 'formodel';
import { RuntimeStepContext } from '../builders/step-context';
import { StepperBuilder } from '../builders/stepper-builder';
import { FormConfig } from '../form-config/form-config';
import { effectiveSteps } from './effective-sequence';

type One = { v: string };
const form = (label: string): FormConfig<One> => ({
  model: () => ({ v: '' }),
  ui: UiFormConfigBuilder.from({ v: '' }).v(text(label)),
});

type Basics = { accountType: string };
const basicsForm: FormConfig<Basics> = {
  model: () => ({ accountType: '' }),
  ui: UiFormConfigBuilder.from({ accountType: '' }).accountType(text('Basics')),
};

// admin/user paths that rejoin: Advanced is gated on shared.accountType, and a
// step gated on a prior form's committed value shows the `value()` source too.
const wizard = new StepperBuilder()
  .withState({ accountType: 'user' as 'user' | 'admin' })
  .createForm('basics', basicsForm)
  .createForm('adminConfig', form('Advanced'))
  .createForm('userMeta', form('Settings'))
  .createForm('review', form('Review'))
  .createStep((s) => s.createPage({ options: { heading: 'Basics' } }, (p) => p.addForm((f) => f.basics)))
  .createStep((s) => s.createPage({ options: { heading: 'Advanced' } }, (p) => p.addForm((f) => f.adminConfig)), {
    when: ({ shared }) => shared.accountType === 'admin',
  })
  .createStep((s) => s.createPage({ options: { heading: 'Settings' } }, (p) => p.addForm((f) => f.userMeta)), {
    when: ({ value }) => value('basics')?.accountType !== 'admin',
  })
  .createStep((s) => s.createPage({ options: { heading: 'Review' } }, (p) => p.addForm((f) => f.review)))
  .build();

function ctx(over: Partial<RuntimeStepContext> = {}): RuntimeStepContext {
  return { shared: {}, value: () => undefined, ...over };
}

describe('effectiveSteps', () => {
  it('keeps an unconditional step always', () => {
    expect(effectiveSteps(wizard.steps, ctx()).includes(wizard.steps[0])).toBe(true);
    expect(effectiveSteps(wizard.steps, ctx()).includes(wizard.steps[3])).toBe(true);
  });

  it('drops a step whose `when` reads false from shared state', () => {
    const seq = effectiveSteps(wizard.steps, ctx({ shared: { accountType: 'user' } }));
    expect(seq).not.toContain(wizard.steps[1]); // Advanced hidden for non-admins
  });

  it('includes the step when its shared condition holds', () => {
    const seq = effectiveSteps(wizard.steps, ctx({ shared: { accountType: 'admin' } }));
    expect(seq).toContain(wizard.steps[1]);
  });

  it('evaluates `value(form)` against a prior step’s committed model', () => {
    const asAdmin = ctx({ value: (n) => (n === 'basics' ? { accountType: 'admin' } : undefined) });
    // Settings (gated on basics !== admin) is dropped once basics committed admin.
    expect(effectiveSteps(wizard.steps, asAdmin)).not.toContain(wizard.steps[2]);
  });

  it('the two branches rejoin: admin and user paths differ then share Review', () => {
    const admin = effectiveSteps(wizard.steps, ctx({ shared: { accountType: 'admin' } }));
    const user = effectiveSteps(wizard.steps, ctx({ shared: { accountType: 'user' } }));
    expect(admin.map((s) => s.pages[0].options.heading)).toEqual(['Basics', 'Advanced', 'Settings', 'Review']);
    expect(user.map((s) => s.pages[0].options.heading)).toEqual(['Basics', 'Settings', 'Review']);
    // Advanced uses shared (admin only); Settings uses value() which is undefined
    // here, so it stays — the two condition *sources* are exercised independently.
  });
});
