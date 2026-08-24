import { EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FieldTree } from '@angular/forms/signals';
import { UiFormConfigBuilder, email, text } from 'formodel';
import { FormConfig } from '../form-config/form-config';
import { AnyFormProvider } from '../builders/step-context';
import { StepperBuilder } from '../builders/stepper-builder';
import { SharedState } from '../sync/shared-state';
import { materializeStep, resolveStepForms, stepFormNames } from './materialize-step';

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

describe('materializeStep', () => {
  it('carries a value entered in step 1 into step 5 through shared state', () => {
    const stepper = buildStepper();
    const injector = TestBed.inject(EnvironmentInjector);
    const pool = stepper.forms as unknown as Record<string, FormConfig<Record<string, unknown>>>;
    const shared = stepper.shared as unknown as SharedState<Record<string, unknown>>;

    // Enter step 1, type into the account email, commit on the way out.
    const step1 = materializeStep(stepper.steps[0], pool, {}, shared, injector);
    const root1 = step1.forms[0].state.rootForm as unknown as Record<string, FieldTree<unknown>>;
    const accountEmail = root1['email'];
    accountEmail().value.set('alice@example.com');
    accountEmail().markAsDirty();
    step1.forms[0].commit();

    // Enter step 2: its email is pristine, so it picks up the shared value.
    const step2 = materializeStep(stepper.steps[1], pool, {}, shared, injector);
    const root2 = step2.forms[0].state.rootForm as unknown as Record<string, FieldTree<unknown>>;
    const billingEmail = root2['email'];
    expect(billingEmail().value()).toBe('alice@example.com');
  });

  it('registers each form so the step folds completion over it', () => {
    const stepper = buildStepper();
    const injector = TestBed.inject(EnvironmentInjector);
    const pool = stepper.forms as unknown as Record<string, FormConfig<Record<string, unknown>>>;
    const shared = stepper.shared as unknown as SharedState<Record<string, unknown>>;

    const step1 = materializeStep(stepper.steps[0], pool, {}, shared, injector);
    expect(step1.registry.live().length).toBe(1);
    // No schema on these forms, so they are valid and the step is complete.
    expect(step1.registry.completed()).toBe(true);
  });

  it('seeds and commits a nested-group field through its path', () => {
    type Addr = { address: { city: string } };
    const addrForm: FormConfig<Addr> = {
      model: () => ({ address: { city: '' } }),
      ui: UiFormConfigBuilder.from({ address: { city: '' } }).address(
        { label: 'Address', maxCols: 1 },
        (b) => b.city(text('City')),
      ),
    };
    const stepper = new StepperBuilder()
      .withState({ city: '' })
      .createForm('addr', addrForm)
      .createStep((step) =>
        step.createPage({ options: {} }, (page) =>
          page.addForm((f) => f.addr, {
            bind: (l) => l.link((m) => m.address.city, (s) => s.city),
          }),
        ),
      )
      .build();

    const injector = TestBed.inject(EnvironmentInjector);
    const pool = stepper.forms as unknown as Record<string, FormConfig<Record<string, unknown>>>;
    const shared = stepper.shared as unknown as SharedState<Record<string, unknown>>;

    shared.patch({ city: 'Oslo' });
    const live = materializeStep(stepper.steps[0], pool, {}, shared, injector); // seeds on entry
    const root = live.forms[0].state.rootForm as unknown as {
      address: Record<string, FieldTree<unknown>>;
    };
    expect(root.address['city']().value()).toBe('Oslo'); // shared → nested field

    root.address['city']().value.set('Bergen');
    root.address['city']().markAsDirty();
    live.forms[0].commit();
    expect(shared.get('city')).toBe('Bergen'); // nested field → shared
  });

  it('lists a step’s form names depth-first', () => {
    const stepper = buildStepper();
    expect(stepFormNames(stepper.steps[0])).toEqual(['account']);
    expect(stepFormNames(stepper.steps[1])).toEqual(['billing']);
  });

  it('resolveStepForms awaits a lazily-loaded form and passes eager ones through', async () => {
    const lazyStepper = new StepperBuilder()
      .withState({})
      .createForm('account', account)
      .createForm('billing', () => Promise.resolve(billing)) // lazy provider
      .createStep((step) =>
        step.createPage({ options: {} }, (page) => page.addForm((f) => f.account).addForm((f) => f.billing)),
      )
      .build();

    const pool = lazyStepper.forms as unknown as Record<string, AnyFormProvider>;
    const resolved = await resolveStepForms(lazyStepper.steps[0], pool);

    expect(resolved['account']).toBe(account); // eager: passed through
    expect(resolved['billing']).toBe(billing); // lazy: awaited from the loader
  });
});
