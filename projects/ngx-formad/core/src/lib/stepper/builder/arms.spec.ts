import { Signal, signal } from '@angular/core';
import { text, UiFormConfigBuilder } from 'formodel';
import { FormConfig } from '../../form';
import { effectiveSteps } from '../runtime/effective-sequence';
import { RuntimeStepperContext } from '../types/step-context';
import { isStepNode } from './flow';
import { StepperBuilder } from './stepper-builder';

// The arms of a `branch` and of a `fork` are authored the same way: each is a linear chain over the level's
// context, and what it declares - pool, state, providers, control kinds, steps - is flattened into that level under
// the gate its key earns. `branch` rejoins the chain, `fork` ends it; nothing else differs.

type One = { v: string };
const form = (label: string): FormConfig<One> => ({
  model: () => ({ v: '' }),
  ui: UiFormConfigBuilder.from({ v: '' }).v(text(label)),
});

function ctx(values: Record<string, unknown>): RuntimeStepperContext {
  const shared: Record<string, Signal<unknown>> = {};
  for (const [key, value] of Object.entries(values)) shared[key] = signal(value);

  return { steps: {}, shared, flow: undefined, parent: undefined };
}

const everyStepEntered = () => true;

const names = (steps: readonly { name?: string }[]) => steps.map((s) => s.name);

class ArmService {}

const plans = new StepperBuilder()
  .withState({ plan: '' as '' | 'basic' | 'plus' })
  .createForm('cart', form('Cart'))
  .createStep((s) => s.createPage((p) => p.addForm('cart')), { name: 'cart' })
  .branch((c) => c.shared.plan() || null, {
    basic: (arm) =>
      arm
        .createForm('address', form('Address'))
        .createStep((s) => s.createPage((p) => p.addForm('address')), { name: 'home' }),
    plus: (arm) =>
      arm
        .withState({ perks: 0 })
        .provide(ArmService)
        .createForm('perks', form('Perks'))
        .createStep((s) => s.createPage((p) => p.addForm('perks')), { name: 'perks' })
        .createStep((s) => s.createPage((p) => p.addForm('perks')), { name: 'work' }),
  })
  .createStep((s) => s.createPage((p) => p.addForm('cart')), { name: 'review' })
  .build();

describe('branch - an arm is a linear chain flattened into its level', () => {
  it('walks the chosen arm’s steps between the steps around the branch', () => {
    expect(names(effectiveSteps(plans.steps, ctx({ plan: 'basic' }), everyStepEntered))).toEqual(['cart', 'home', 'review']);
    expect(names(effectiveSteps(plans.steps, ctx({ plan: 'plus' }), everyStepEntered))).toEqual(['cart', 'perks', 'work', 'review']);
  });

  it('walks no arm while the selector names none, and rejoins after it', () => {
    expect(names(effectiveSteps(plans.steps, ctx({ plan: '' }), everyStepEntered))).toEqual(['cart', 'review']);
  });

  it('merges every arm’s pool into the level’s', () => {
    expect(Object.keys(plans.forms)).toEqual(['cart', 'address', 'perks']);
  });

  it('merges an arm’s state slice and providers into the level’s', () => {
    expect(plans.shared.get('perks')).toBe(0);
    expect(plans.providers).toEqual([ArmService]);
  });

  it('keeps an arm step’s own gate under the arm’s', () => {
    const gated = new StepperBuilder()
      .withState({ plan: '' as '' | 'basic', vip: false })
      .createForm('a', form('A'))
      .branch((c) => c.shared.plan() || null, {
        basic: (arm) =>
          arm
            .createStep((s) => s.createPage((p) => p.addForm('a')), { name: 'always' })
            .createStep((s) => s.createPage((p) => p.addForm('a')), { name: 'vip', activeWhen: (c) => c.shared.vip() }),
      })
      .build();

    expect(names(effectiveSteps(gated.steps, ctx({ plan: 'basic', vip: false }), everyStepEntered))).toEqual(['always']);
    expect(names(effectiveSteps(gated.steps, ctx({ plan: 'basic', vip: true }), everyStepEntered))).toEqual(['always', 'vip']);
    expect(names(effectiveSteps(gated.steps, ctx({ plan: '', vip: true }), everyStepEntered))).toEqual([]);
  });

  it('asks the selector once per walk, however many arms', () => {
    let asked = 0;
    const counted = new StepperBuilder()
      .withState({ plan: 'a' })
      .createForm('f', form('F'))
      .branch(
        (c) => {
          asked++;

          return c.shared.plan();
        },
        {
          a: (arm) => arm.createStep((s) => s.createPage((p) => p.addForm('f')), { name: 'a1' }).createStep((s) => s.createPage((p) => p.addForm('f')), { name: 'a2' }),
          b: (arm) => arm.createStep((s) => s.createPage((p) => p.addForm('f')), { name: 'b1' }),
        },
      )
      .build();

    effectiveSteps(counted.steps, ctx({ plan: 'a' }), everyStepEntered);

    expect(asked).toBe(1);
  });

  it('nests: an inner branch sits under the outer arm’s gate', () => {
    const nested = new StepperBuilder()
      .withState({ outer: '' as '' | 'x', inner: '' as '' | 'y' })
      .createForm('f', form('F'))
      .branch((c) => c.shared.outer() || null, {
        x: (arm) =>
          arm.branch((c) => c.shared.inner() || null, {
            y: (inner) => inner.createStep((s) => s.createPage((p) => p.addForm('f')), { name: 'xy' }),
          }),
      })
      .build();

    expect(names(effectiveSteps(nested.steps, ctx({ outer: 'x', inner: 'y' }), everyStepEntered))).toEqual(['xy']);
    expect(names(effectiveSteps(nested.steps, ctx({ outer: '', inner: 'y' }), everyStepEntered))).toEqual([]);
  });

  it('emits plain step nodes: the arm leaves no trace but the gate', () => {
    expect(plans.steps.every(isStepNode)).toBe(true);
  });
});

describe('branch - authoring errors', () => {
  const base = () =>
    new StepperBuilder()
      .withState({ plan: '' })
      .createForm('cart', form('Cart'))
      .createStep((s) => s.createPage((p) => p.addForm('cart')), { name: 'cart' });

  it('refuses an arm step named like a step before the branch, or like another arm’s', () => {
    expect(() =>
      base().branch((c) => c.shared.plan(), {
        a: (arm) => arm.createStep((s) => s.createPage((p) => p.addForm('cart')), { name: 'cart' }),
      }),
    ).toThrow(/already taken/);

    expect(() =>
      base().branch((c) => c.shared.plan(), {
        a: (arm) => arm.createStep((s) => s.createPage((p) => p.addForm('cart')), { name: 'same' }),
        b: (arm) => arm.createStep((s) => s.createPage((p) => p.addForm('cart')), { name: 'same' }),
      }),
    ).toThrow(/already taken/);
  });

  it('refuses an arm form named like one in the pool', () => {
    expect(() =>
      base().branch((c) => c.shared.plan(), {
        a: (arm) => arm.createForm('cart', form('Again')),
      }),
    ).toThrow(/already taken/);
  });

  it('refuses an arm that forks: a fork cannot rejoin', () => {
    expect(() =>
      base().branch((c) => c.shared.plan(), {
        a: (arm) =>
          arm.fork((c) => c.shared.plan(), {
            x: (inner) => inner.createStep((s) => s.createPage((p) => p.addForm('cart')), { name: 'x' }),
          }),
      }),
    ).toThrow(/cannot rejoin/);
  });
});
