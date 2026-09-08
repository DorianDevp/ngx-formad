import { UiFormConfigBuilder, text } from 'formodel';
import { isStepNode, SequenceNode } from '../builders/flow';
import { Signal, signal } from '@angular/core';
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
  .createStep((s) => s.createPage((p) => p.addForm('basics'), { heading: 'Basics' }), {
    name: 'basics',
  })
  .createStep((s) => s.createPage((p) => p.addForm('adminConfig'), { heading: 'Advanced' }), {
    when: ({ shared }) => shared.accountType() === 'admin',
  })
  .createStep((s) => s.createPage((p) => p.addForm('userMeta'), { heading: 'Settings' }), {
    // A predecessor's LIVE instance — `basics` is unconditional, but a gate may run
    // before it exists, so it reads as optional here.
    when: ({ steps }) => steps.basics?.basics.model().accountType !== 'admin',
  })
  .createStep((s) => s.createPage((p) => p.addForm('review'), { heading: 'Review' }))
  .build();


// A hand-built runtime context, the shape a controller supplies: shared as signals,
// predecessors' instances under `steps`.
function ctx(over: { shared?: Record<string, unknown>; steps?: RuntimeStepContext['steps'] } = {}): RuntimeStepContext {
  const shared: Record<string, Signal<unknown>> = {};
  for (const [key, value] of Object.entries(over.shared ?? {})) shared[key] = signal(value);

  return { steps: over.steps ?? {}, shared, flow: undefined, parent: undefined };
}

describe('effectiveSteps', () => {
  it('keeps an unconditional step always', () => {
    const plain = ctx({ shared: { accountType: 'user' } });
    expect(effectiveSteps(wizard.steps, plain).includes(wizard.steps[0])).toBe(true);
    expect(effectiveSteps(wizard.steps, plain).includes(wizard.steps[3])).toBe(true);
  });

  it('drops a step whose `when` reads false from shared state', () => {
    const seq = effectiveSteps(wizard.steps, ctx({ shared: { accountType: 'user' } }));
    expect(seq).not.toContain(wizard.steps[1]); // Advanced hidden for non-admins
  });

  it('includes the step when its shared condition holds', () => {
    const seq = effectiveSteps(wizard.steps, ctx({ shared: { accountType: 'admin' } }));
    expect(seq).toContain(wizard.steps[1]);
  });

  it('evaluates a predecessor’s live instance through `steps`', () => {
    const asAdmin = ctx({
      shared: { accountType: 'user' },
      steps: { basics: { basics: { model: () => ({ accountType: 'admin' }) } } },
    });
    // Settings (gated on basics !== admin) is dropped once basics holds admin.
    expect(effectiveSteps(wizard.steps, asAdmin)).not.toContain(wizard.steps[2]);
  });

  it('the two branches rejoin: admin and user paths differ then share Review', () => {
    const admin = effectiveSteps(wizard.steps, ctx({ shared: { accountType: 'admin' } }));
    const user = effectiveSteps(wizard.steps, ctx({ shared: { accountType: 'user' } }));
    expect(headings(admin)).toEqual(['Basics', 'Advanced', 'Settings', 'Review']);
    expect(headings(user)).toEqual(['Basics', 'Settings', 'Review']);
    // Advanced uses shared (admin only); Settings reads a predecessor that does not
    // exist here, so it stays — the two condition *sources* are exercised independently.
  });
});

// `.branch()` compiles to `when`-gated steps, so the same pure filter proves it:
// the chosen branch's steps survive in order, the rest drop, and post-branch steps
// rejoin. A nested branch ANDs its guard with the outer one.
// A page's heading is `Reactive<string>` - a value or a getter - so the assertion
// resolves it the way the controller does.
const headings = (steps: readonly SequenceNode[]) =>
  steps.filter(isStepNode).map((s) => {
    const pages = 'build' in s.pages ? s.pages.build(ctx()) : s.pages;
    const heading = pages[0].options.heading;
    return typeof heading === 'function' ? heading() : heading;
  });

const branched = new StepperBuilder()
  .withState({ plan: 'free' as 'free' | 'pro', addons: false })
  .createForm('start', form('Start'))
  .createForm('pro', form('Pro'))
  .createForm('addons', form('Addons'))
  .createForm('free', form('Free'))
  .createForm('done', form('Done'))
  .createStep((s) => s.createPage((p) => p.addForm('start'), { heading: 'Start' }))
  .branch((c) => c.shared.plan(), {
    pro: (b) =>
      b
        .step((s) => s.createPage((p) => p.addForm('pro'), { heading: 'Pro' }))
        // a step inside the branch with its own extra condition (ANDed with the guard)
        .step((s) => s.createPage((p) => p.addForm('addons'), { heading: 'Addons' }), {
          when: ({ shared }) => shared.addons() === true,
        }),
    free: (b) => b.step((s) => s.createPage((p) => p.addForm('free'), { heading: 'Free' })),
  })
  .createStep((s) => s.createPage((p) => p.addForm('done'), { heading: 'Done' }))
  .build();

describe('branching (sugar over conditional steps)', () => {
  it('selects the chosen branch and rejoins after it', () => {
    expect(headings(effectiveSteps(branched.steps, ctx({ shared: { plan: 'free', addons: false } })))).toEqual([
      'Start',
      'Free',
      'Done',
    ]);
    expect(headings(effectiveSteps(branched.steps, ctx({ shared: { plan: 'pro', addons: false } })))).toEqual([
      'Start',
      'Pro',
      'Done', // Addons dropped: its own `when` (addons === true) failed
    ]);
  });

  it('ANDs a branch step’s own condition with the branch guard', () => {
    expect(headings(effectiveSteps(branched.steps, ctx({ shared: { plan: 'pro', addons: true } })))).toEqual([
      'Start',
      'Pro',
      'Addons', // now both the branch guard and the step's `when` hold
      'Done',
    ]);
    // The Addons step never appears for the free plan, regardless of the addons flag.
    expect(headings(effectiveSteps(branched.steps, ctx({ shared: { plan: 'free', addons: true } })))).toEqual([
      'Start',
      'Free',
      'Done',
    ]);
  });
});
