import { select, text, UiFormConfigBuilder } from 'formodel';
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

// A cart's fulfilment: the answer a branch selects its arm by, none while unanswered.
type Fulfilment = 'delivery' | 'pickup';
type Cart = { fulfilment: Fulfilment | null };
const cartForm: FormConfig<Cart> = {
  model: () => ({ fulfilment: null }),
  // The seed only shapes the builder (a null key gets no field method); `model` holds the unanswered state.
  ui: UiFormConfigBuilder.from({ fulfilment: 'pickup' as Fulfilment | null }).fulfilment(
    select('Fulfilment', [
      { value: 'delivery', description: 'Deliver to my address' },
      { value: 'pickup', description: 'Pick up in store' },
    ]),
  ),
};

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
    activeWhen: ({ shared }) => shared.accountType() === 'admin',
  })
  .createStep((s) => s.createPage((p) => p.addForm('userMeta'), { heading: 'Settings' }), {
    // A predecessor's LIVE instance — `basics` is unconditional, and a gate is asked
    // only once the steps before it are entered, so it reads without a guard.
    activeWhen: ({ steps }) => steps.basics.basics.model().accountType !== 'admin',
  })
  .createStep((s) => s.createPage((p) => p.addForm('review'), { heading: 'Review' }))
  .build();

// A hand-built runtime context, the shape a controller supplies: shared as signals,
// predecessors' instances under `steps`.
function ctx(over: { shared?: Record<string, unknown>; steps?: RuntimeStepperContext['steps'] } = {}): RuntimeStepperContext {
  const shared: Record<string, Signal<unknown>> = {};
  for (const [key, value] of Object.entries(over.shared ?? {})) shared[key] = signal(value);

  return { steps: over.steps ?? {}, shared, flow: undefined, parent: undefined };
}

// The `basics` entry as the controller would hand it to a successor's gate.
const basics = (accountType: string): RuntimeStepperContext['steps'] => ({
  basics: { basics: { model: () => ({ accountType }) } },
});

// Every step entered: the sequence a controller sees once the user has walked it all.
const everyStepEntered = () => true;

describe('effectiveSteps', () => {
  it('keeps an unconditional step always', () => {
    const plain = ctx({ shared: { accountType: 'user' }, steps: basics('user') });
    expect(effectiveSteps(wizard.steps, plain, everyStepEntered).includes(wizard.steps[0])).toBe(true);
    expect(effectiveSteps(wizard.steps, plain, everyStepEntered).includes(wizard.steps[3])).toBe(true);
  });

  it('drops a step whose `activeWhen` reads false from shared state', () => {
    const seq = effectiveSteps(wizard.steps, ctx({ shared: { accountType: 'user' }, steps: basics('user') }), everyStepEntered);
    expect(seq).not.toContain(wizard.steps[1]); // Advanced hidden for non-admins
  });

  it('includes the step when its shared condition holds', () => {
    const seq = effectiveSteps(wizard.steps, ctx({ shared: { accountType: 'admin' }, steps: basics('user') }), everyStepEntered);
    expect(seq).toContain(wizard.steps[1]);
  });

  it('evaluates a predecessor’s live instance through `steps`', () => {
    const asAdmin = ctx({ shared: { accountType: 'user' }, steps: basics('admin') });
    // Settings (gated on basics !== admin) is dropped once basics holds admin.
    expect(effectiveSteps(wizard.steps, asAdmin, everyStepEntered)).not.toContain(wizard.steps[2]);
  });

  it('the two branches rejoin: admin and user paths differ then share Review', () => {
    const admin = effectiveSteps(wizard.steps, ctx({ shared: { accountType: 'admin' }, steps: basics('user') }), everyStepEntered);
    const user = effectiveSteps(wizard.steps, ctx({ shared: { accountType: 'user' }, steps: basics('user') }), everyStepEntered);
    expect(headings(admin)).toEqual(['Basics', 'Advanced', 'Settings', 'Review']);
    expect(headings(user)).toEqual(['Basics', 'Settings', 'Review']);
    // Advanced uses shared (admin only); Settings reads the predecessor's instance —
    // the two condition *sources* are exercised independently.
  });
});

// The front: a gate is asked only while every step listed before it has been entered
// or skipped. Past the first listed step not yet entered, gated steps stay undecided.
type Asked = { count: number };
const asking = (asked: Asked, answer: boolean) => () => {
  asked.count++;
  return answer;
};

describe('the front', () => {
  const build = (gateB: () => boolean, gateC: () => boolean) =>
    new StepperBuilder()
      .withState({})
      .createForm('a', form('A'))
      .createForm('b', form('B'))
      .createForm('c', form('C'))
      .createForm('d', form('D'))
      .createStep((s) => s.createPage((p) => p.addForm('a'), { heading: 'A' }), { name: 'a' })
      .createStep((s) => s.createPage((p) => p.addForm('b'), { heading: 'B' }), { name: 'b', activeWhen: gateB })
      .createStep((s) => s.createPage((p) => p.addForm('c'), { heading: 'C' }), { name: 'c', activeWhen: gateC })
      .createStep((s) => s.createPage((p) => p.addForm('d'), { heading: 'D' }), { name: 'd' })
      .build();

  const enteredOnly = (steps: readonly SequenceNode[], ...indices: number[]) => {
    const entered = new Set(indices.map((i) => steps[i]));
    return (node: SequenceNode) => entered.has(node);
  };

  it('does not ask a gate past the first listed step not yet entered', () => {
    const askedB: Asked = { count: 0 };
    const flow = build(asking(askedB, true), () => true);
    const seq = effectiveSteps(flow.steps, ctx(), enteredOnly(flow.steps));

    expect(askedB.count).toBe(0);
    expect(headings(seq)).toEqual(['A', 'D']); // ungated steps are listed throughout
  });

  it('asks a gate once every step before it is entered', () => {
    const askedB: Asked = { count: 0 };
    const askedC: Asked = { count: 0 };
    const flow = build(asking(askedB, true), asking(askedC, true));
    const seq = effectiveSteps(flow.steps, ctx(), enteredOnly(flow.steps, 0));

    expect(askedB.count).toBe(1);
    expect(askedC.count).toBe(0); // B is listed but not entered: C waits
    expect(headings(seq)).toEqual(['A', 'B', 'D']);
  });

  it('a skipped gated step keeps the front open for the next gate', () => {
    const askedC: Asked = { count: 0 };
    const flow = build(() => false, asking(askedC, true));
    const seq = effectiveSteps(flow.steps, ctx(), enteredOnly(flow.steps, 0));

    expect(askedC.count).toBe(1); // B skipped itself, so C's predecessors are settled
    expect(headings(seq)).toEqual(['A', 'C', 'D']);
  });

  it('decides the whole sequence once every listed step is entered', () => {
    const flow = build(() => true, () => false);
    const seq = effectiveSteps(flow.steps, ctx(), enteredOnly(flow.steps, 0, 1));

    expect(headings(seq)).toEqual(['A', 'B', 'D']);
  });
});

// `.branch()` compiles to `activeWhen`-gated steps, so the same pure walk proves it:
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
        .createStep((s) => s.createPage((p) => p.addForm('pro'), { heading: 'Pro' }))
        // a step inside the branch with its own extra condition (ANDed with the guard)
        .createStep((s) => s.createPage((p) => p.addForm('addons'), { heading: 'Addons' }), {
          activeWhen: ({ shared }) => shared.addons() === true,
        }),
    free: (b) => b.createStep((s) => s.createPage((p) => p.addForm('free'), { heading: 'Free' })),
  })
  .createStep((s) => s.createPage((p) => p.addForm('done'), { heading: 'Done' }))
  .build();

describe('branching (sugar over conditional steps)', () => {
  it('selects the chosen branch and rejoins after it', () => {
    expect(headings(effectiveSteps(branched.steps, ctx({ shared: { plan: 'free', addons: false } }), everyStepEntered))).toEqual([
      'Start',
      'Free',
      'Done',
    ]);
    expect(headings(effectiveSteps(branched.steps, ctx({ shared: { plan: 'pro', addons: false } }), everyStepEntered))).toEqual([
      'Start',
      'Pro',
      'Done', // Addons dropped: its own `activeWhen` (addons === true) failed
    ]);
  });

  it('ANDs a branch step’s own condition with the branch guard', () => {
    expect(headings(effectiveSteps(branched.steps, ctx({ shared: { plan: 'pro', addons: true } }), everyStepEntered))).toEqual([
      'Start',
      'Pro',
      'Addons', // now both the branch guard and the step's `activeWhen` hold
      'Done',
    ]);
    // The Addons step never appears for the free plan, regardless of the addons flag.
    expect(headings(effectiveSteps(branched.steps, ctx({ shared: { plan: 'free', addons: true } }), everyStepEntered))).toEqual([
      'Start',
      'Free',
      'Done',
    ]);
  });

  it('asks the selector once per walk, and only once the steps before the branch are entered', () => {
    let asked = 0;
    const flow = new StepperBuilder()
      .withState({})
      .createForm('cart', cartForm)
      .createForm('address', form('Address'))
      .createForm('store', form('Store'))
      .createStep((s) => s.createPage((p) => p.addForm('cart'), { heading: 'Cart' }), { name: 'cart' })
      .branch(
        // The predecessor is read unguarded, and its answer IS the arm's key: the selector
        // is asked only once `cart` is entered, and names no arm while the answer is null.
        (c) => {
          asked++;
          return c.steps.cart.cart.model().fulfilment;
        },
        {
          delivery: (b) => b.createStep((s) => s.createPage((p) => p.addForm('address'), { heading: 'Address' })),
          pickup: (b) => b.createStep((s) => s.createPage((p) => p.addForm('store'), { heading: 'Store' })),
        },
      )
      .build();
    const answering = (fulfilment: Fulfilment | null) =>
      ctx({ steps: { cart: { cart: { model: () => ({ fulfilment }) } } } });

    const nothingEntered = () => false;
    expect(headings(effectiveSteps(flow.steps, answering('delivery'), nothingEntered))).toEqual(['Cart']);
    expect(asked).toBe(0);

    const cartEntered = (node: SequenceNode) => node === flow.steps[0];
    expect(headings(effectiveSteps(flow.steps, answering(null), cartEntered))).toEqual(['Cart']);
    expect(asked).toBe(1); // decided once for both arms, and the null answer names no arm

    expect(headings(effectiveSteps(flow.steps, answering('delivery'), cartEntered))).toEqual(['Cart', 'Address']);
    expect(headings(effectiveSteps(flow.steps, answering('pickup'), cartEntered))).toEqual(['Cart', 'Store']);
    expect(asked).toBe(3); // one walk, one decision
  });
});
