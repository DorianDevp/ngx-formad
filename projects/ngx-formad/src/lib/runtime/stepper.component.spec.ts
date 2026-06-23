import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { required } from '@angular/forms/signals';
import { UiFormConfigBuilder, email, text } from 'formodel';
import { asStepper, RuntimeStepper, StepperBuilder } from '../builders/stepper-builder';
import { FormConfig } from '../form-config/form-config';
import { StepperComponent } from './stepper.component';

type Labelled = { v: string };
const labelForm = (label: string): FormConfig<Labelled> => ({
  model: () => ({ v: '' }),
  ui: UiFormConfigBuilder.from({ v: '' }).v(text(label)),
});
const requiredForm = (label: string): FormConfig<Labelled> => ({
  model: () => ({ v: '' }),
  ui: UiFormConfigBuilder.from({ v: '' }).v(text(label)),
  schema: (p) => required(p.v),
});

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
}

function buttonByText(fixture: ComponentFixture<unknown>, label: string): HTMLButtonElement | undefined {
  return Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(
    (b) => b.textContent?.trim() === label,
  );
}

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

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class ConditionalHost {
  // Step 2 is hidden by its `when`, so Next on step 1 lands on step 3.
  readonly stepper: RuntimeStepper = asStepper(
    new StepperBuilder()
      .withState({ hide: true })
      .createForm('a', labelForm('First'))
      .createForm('b', labelForm('Second'))
      .createForm('c', labelForm('Third'))
      .createStep((s) => s.createPage({ options: { heading: '1' } }, (p) => p.addForm((f) => f.a)))
      .createStep((s) => s.createPage({ options: { heading: '2' } }, (p) => p.addForm((f) => f.b)), {
        when: ({ shared }) => !shared.hide,
      })
      .createStep((s) => s.createPage({ options: { heading: '3' } }, (p) => p.addForm((f) => f.c)))
      .build(),
  );
}

describe('StepperComponent — conditional steps', () => {
  it('drops a step whose `when` is false and navigates past it', async () => {
    const fixture = TestBed.createComponent(ConditionalHost);
    await settle(fixture);

    expect(fixture.nativeElement.textContent).toContain('First');

    buttonByText(fixture, 'Next')!.click();
    await settle(fixture);

    // Step 2 ("Second") was hidden, so Next jumped straight to step 3 ("Third").
    expect(fixture.nativeElement.textContent).toContain('Third');
    expect(fixture.nativeElement.textContent).not.toContain('Second');
  });
});

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class OptionalHost {
  // Step 1 is optional and has a required field, so Next is gated but Skip is not.
  readonly stepper: RuntimeStepper = asStepper(
    new StepperBuilder()
      .withState({})
      .createForm('a', requiredForm('Need'))
      .createForm('b', labelForm('After'))
      .createStep((s) => s.createPage({ options: { heading: '1' } }, (p) => p.addForm((f) => f.a)), {
        optional: true,
      })
      .createStep((s) => s.createPage({ options: { heading: '2' } }, (p) => p.addForm((f) => f.b)))
      .build(),
  );
}

describe('StepperComponent — optional steps', () => {
  it('offers a Skip that bypasses the completion gate', async () => {
    const fixture = TestBed.createComponent(OptionalHost);
    await settle(fixture);

    // The required field is empty, so Next is disabled — but Skip is offered.
    expect(buttonByText(fixture, 'Next')!.disabled).toBe(true);
    const skip = buttonByText(fixture, 'Skip');
    expect(skip).toBeTruthy();

    skip!.click();
    await settle(fixture);

    expect(fixture.nativeElement.textContent).toContain('After');
  });
});
