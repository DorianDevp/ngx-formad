import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiFormConfigBuilder, email, text } from 'formodel';
import { asStepper, RuntimeStepper, StepperBuilder } from '../builders/stepper-builder';
import { FormConfig } from '../form-config/form-config';
import { StepperComponent } from './stepper.component';

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

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class Host {
  readonly stepper: RuntimeStepper = asStepper(
    new StepperBuilder()
      .withState({ email: '' })
      .createForm('account', account)
      .createForm('billing', billing)
      .createStep((step) =>
        step.createPage({ options: { heading: 'Account' } }, (page) =>
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
        step.createPage({ options: { heading: 'Billing' } }, (page) =>
          page.addForm((f) => f.billing, {
            bind: (l) =>
              l.link(
                (m) => m.email,
                (s) => s.email,
              ),
          }),
        ),
      )
      .build(),
  );
}

describe('StepperComponent', () => {
  let fixture: ComponentFixture<Host>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  });

  function emailInput(): HTMLInputElement {
    return fixture.nativeElement.querySelector('input');
  }

  function nextButton(): HTMLButtonElement {
    const buttons = fixture.nativeElement.querySelectorAll('button');
    return buttons[buttons.length - 1];
  }

  it('renders the first step', () => {
    expect(emailInput()).toBeTruthy();
  });

  it('carries a value typed in step 1 into step 2 on Next', async () => {
    const input = emailInput();
    input.value = 'carried@example.com';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    nextButton().click();
    fixture.detectChanges();
    await fixture.whenStable();

    // Step 2's billing email was pristine, so it picked up the shared value.
    expect(emailInput().value).toBe('carried@example.com');
  });
});
