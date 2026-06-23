import { EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UiFormConfigBuilder, email, text } from 'formodel';
import { FormConfig } from '../form-config/form-config';
import { StepperBuilder } from '../builders/stepper-builder';
import { SharedState } from '../sync/shared-state';
import { materializeStep } from './materialize-step';

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
    const step1 = materializeStep(stepper.steps[0], pool, shared, injector);
    const accountEmail = (step1.forms[0].state.rootForm as any).email;
    accountEmail().value.set('alice@example.com');
    accountEmail().markAsDirty();
    step1.forms[0].commit();

    // Enter step 2: its email is pristine, so it picks up the shared value.
    const step2 = materializeStep(stepper.steps[1], pool, shared, injector);
    const billingEmail = (step2.forms[0].state.rootForm as any).email;
    expect(billingEmail().value()).toBe('alice@example.com');
  });

  it('registers each form so the step folds completion over it', () => {
    const stepper = buildStepper();
    const injector = TestBed.inject(EnvironmentInjector);
    const pool = stepper.forms as unknown as Record<string, FormConfig<Record<string, unknown>>>;
    const shared = stepper.shared as unknown as SharedState<Record<string, unknown>>;

    const step1 = materializeStep(stepper.steps[0], pool, shared, injector);
    expect(step1.registry.live().length).toBe(1);
    // No schema on these forms, so they are valid and the step is complete.
    expect(step1.registry.completed()).toBe(true);
  });
});
