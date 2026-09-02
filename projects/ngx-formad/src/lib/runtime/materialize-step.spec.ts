import { EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UiFormConfigBuilder, email, text } from 'formodel';
import { isStepNode, SequenceNode } from '../builders/flow';
import { StepNode } from '../builders/nodes';
import { RuntimeStepContext } from '../builders/step-context';
import { asStepper, StepperBuilder } from '../builders/stepper-builder';
import { FormConfig } from '../form-config/form-config';
import { childOf, FieldLevel } from '../renderer/instantiate-form';
import {
  MaterializeOptions,
  materializeStep,
  resolvePages,
  resolveStepForms,
  stepFormNames,
} from './materialize-step';

type Account = { email: string };
type Billing = { email: string };

const account: FormConfig<Account> = {
  model: () => ({ email: '' }),
  ui: UiFormConfigBuilder.from({ email: '' }).email(email('Email')),
};
const billing: FormConfig<Billing> = {
  model: () => ({ email: '' }),
  ui: UiFormConfigBuilder.from({ email: '' }).email(text('Billing email')),
};

const EMPTY_CONTEXT: RuntimeStepContext = { steps: {}, shared: {}, flow: undefined, parent: undefined };

function buildStepper() {
  return new StepperBuilder()
    .withState({ email: '' })
    .createForm('account', account)
    .createForm('billing', billing)
    .createStep((step) =>
      step.createPage({ options: {} }, (page) =>
        page.addForm((f) => f.account, {
          bind: (l) =>
            l.link(
              (m) => m.email,
              (s) => s.email,
            ),
        }),
      ),
    )
    .createStep((step) =>
      step.createPage({ options: {} }, (page) =>
        page.addForm((f) => f.billing, {
          bind: (l) =>
            l.link(
              (m) => m.email,
              (s) => s.email,
            ),
        }),
      ),
    )
    .build();
}

function leafAt(steps: readonly SequenceNode[], index: number): StepNode {
  const node = steps[index];
  if (!isStepNode(node)) throw new Error(`step ${index} is not a leaf`);

  return node;
}

function pagesAt(steps: readonly SequenceNode[], index: number) {
  return resolvePages(leafAt(steps, index), EMPTY_CONTEXT);
}

async function optionsFor(stepper: ReturnType<typeof buildStepper>, index: number): Promise<MaterializeOptions> {
  const runtime = asStepper(stepper);
  const pages = pagesAt(runtime.steps, index);

  return {
    pool: await resolveStepForms(pages, runtime.forms),
    shared: runtime.shared,
    environment: TestBed.inject(EnvironmentInjector),
    entry: EMPTY_CONTEXT,
  };
}

describe('materializeStep', () => {
  it('carries a value entered in step 1 into step 2 through shared state', async () => {
    const stepper = buildStepper();

    const step1 = materializeStep(pagesAt(stepper.steps, 0), await optionsFor(stepper, 0));
    const accountEmail = childOf(step1.forms[0].state.rootForm, 'email');
    accountEmail().value.set('alice@example.com');
    accountEmail().markAsDirty();
    step1.forms[0].commit();

    const step2 = materializeStep(pagesAt(stepper.steps, 1), await optionsFor(stepper, 1));
    const billingEmail = childOf(step2.forms[0].state.rootForm, 'email');
    expect(billingEmail().value()).toBe('alice@example.com');
  });

  it('registers each form so the step folds completion over it', async () => {
    const stepper = buildStepper();

    const step1 = materializeStep(pagesAt(stepper.steps, 0), await optionsFor(stepper, 0));

    expect(step1.registry.live().length).toBe(1);
    expect(step1.registry.completed()).toBe(true);
  });

  it('seeds and commits a nested-group field through its path', async () => {
    type Addr = { address: { city: string } };
    const addrForm: FormConfig<Addr> = {
      model: () => ({ address: { city: '' } }),
      ui: UiFormConfigBuilder.from({ address: { city: '' } }).address(
        { label: 'Address', maxCols: 1 },
        (b) => b.city(text('City')),
      ),
    };
    const runtime = asStepper(
      new StepperBuilder()
        .withState({ city: '' })
        .createForm('addr', addrForm)
        .createStep((step) =>
          step.createPage({ options: {} }, (page) =>
            page.addForm((f) => f.addr, {
              bind: (l) => l.link((m) => m.address.city, (s) => s.city),
            }),
          ),
        )
        .build(),
    );
    const pages = pagesAt(runtime.steps, 0);
    const options: MaterializeOptions = {
      pool: await resolveStepForms(pages, runtime.forms),
      shared: runtime.shared,
      environment: TestBed.inject(EnvironmentInjector),
      entry: EMPTY_CONTEXT,
    };

    options.shared.patch({ city: 'Oslo' });
    const live = materializeStep(pages, options);
    const address = childOf(live.forms[0].state.rootForm, 'address') as FieldLevel;
    const city = childOf(address, 'city');
    expect(city().value()).toBe('Oslo');

    city().value.set('Bergen');
    city().markAsDirty();
    live.forms[0].commit();
    expect(options.shared.get('city')).toBe('Bergen');
  });

  it('lists a step’s form names depth-first', () => {
    const stepper = buildStepper();

    expect(stepFormNames(pagesAt(stepper.steps, 0))).toEqual(['account']);
    expect(stepFormNames(pagesAt(stepper.steps, 1))).toEqual(['billing']);
  });

  it('resolveStepForms awaits a lazily-loaded form and passes eager ones through', async () => {
    const runtime = asStepper(
      new StepperBuilder()
        .withState({})
        .createForm('account', account)
        .createForm('billing', () => Promise.resolve(billing))
        .createStep((step) =>
          step.createPage({ options: {} }, (page) => page.addForm((f) => f.account).addForm((f) => f.billing)),
        )
        .build(),
    );

    const resolved = await resolveStepForms(pagesAt(runtime.steps, 0), runtime.forms);

    expect(resolved['account']).toBe(account);
    expect(resolved['billing']).toBe(billing);
  });
});
