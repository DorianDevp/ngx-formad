import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { required } from '@angular/forms/signals';
import { UiFormConfigBuilder, email, text } from 'formodel';
import { FormConfig } from '../../form';
import { provideFormadSuite } from '../../provide';
import { link } from '../builder/shared-link';
import { StepperBuilder } from '../builder/stepper-builder';
import { RuntimeStepper } from '../types/flow';
import { StepperController } from '../types/controller';
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
  // Navigation defers materialization to afterNextRender, so a step change is a
  // multi-hop (set target → render placeholder → build → render forms). Pump a few
  // cycles so the whole chain flushes.
  for (let i = 0; i < 4; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
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
  readonly stepper: RuntimeStepper =     new StepperBuilder()
      .withState({ email: '' })
      .createForm('account', account)
      .createForm('billing', billing)
      .createStep((step) =>
        step.createPage((page) =>
          page.addForm('account', {
            fieldValueBindings: (f, s) => [link(f.email, s.email)],
          }),
        { heading: 'Account' },
        ),
      )
      .createStep((step) =>
        step.createPage((page) =>
          page.addForm('billing', {
            fieldValueBindings: (f, s) => [link(f.email, s.email)],
          }), { heading: 'Billing' },
        ),
      )
      .build();
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
  // Step 2 is hidden by its `activeWhen`, so Next on step 1 lands on step 3.
  readonly stepper: RuntimeStepper =     new StepperBuilder()
      .withState({ hide: true })
      .createForm('a', labelForm('First'))
      .createForm('b', labelForm('Second'))
      .createForm('c', labelForm('Third'))
      .createStep((s) => s.createPage((p) => p.addForm('a'), { heading: '1' }))
      .createStep((s) => s.createPage((p) => p.addForm('b'), { heading: '2' }), {
        activeWhen: ({ shared }) => !shared.hide,
      })
      .createStep((s) => s.createPage((p) => p.addForm('c'), { heading: '3' }))
      .build();
}

describe('StepperComponent — conditional steps', () => {
  it('drops a step whose `activeWhen` is false and navigates past it', async () => {
    const fixture = TestBed.createComponent(ConditionalHost);
    await settle(fixture);

    expect(fixture.nativeElement.textContent).toContain('First');

    buttonByText(fixture, 'Next')!.click();
    await settle(fixture);

    // Step 2 ("Second") was hidden, so Next jumped straight to step 3 ("Third").
    expect(fixture.nativeElement.textContent).toContain('Third');
    expect(fixture.nativeElement.textContent).not.toContain('Second');
  });

  it('mounts a step whose forms are all eager without a loading frame', async () => {
    const fixture = TestBed.createComponent(ConditionalHost);
    await settle(fixture);

    buttonByText(fixture, 'Next')!.click();
    fixture.detectChanges();

    // Built during the click itself, so one pass is enough - no placeholder hop.
    expect(fixture.nativeElement.textContent).toContain('Third');
  });
});

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class OptionalHost {
  // Step 1 is optional and has a required field, so Next is gated but Skip is not.
  readonly stepper: RuntimeStepper =     new StepperBuilder()
      .withState({})
      .createForm('a', requiredForm('Need'))
      .createForm('b', labelForm('After'))
      .createStep((s) => s.createPage((p) => p.addForm('a'), { heading: '1' }), {
        optional: true,
      })
      .createStep((s) => s.createPage((p) => p.addForm('b'), { heading: '2' }))
      .build();
}

describe('StepperComponent — optional steps', () => {
  it('offers a Skip that bypasses the completion gate', async () => {
    const fixture = TestBed.createComponent(OptionalHost);
    await settle(fixture);

    // The required field is empty, so Next is disabled — but Skip is offered.
    expect(buttonByText(fixture, 'Next')!.getAttribute('aria-disabled')).toBe('true');
    const skip = buttonByText(fixture, 'Skip');
    expect(skip).toBeTruthy();

    skip!.click();
    await settle(fixture);

    expect(fixture.nativeElement.textContent).toContain('After');
  });
});

// A custom chrome — the third adapter axis. It reads the controller and renders a
// marker so the test can prove the configured chrome was used over the default.
@Component({
  selector: 'x-chrome',
  template: `<div class="x-chrome">{{ controller().heading() }}</div>`,
})
class CustomChrome {
  readonly controller = input.required<StepperController>();
}

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class ChromeHost {
  readonly stepper: RuntimeStepper =     new StepperBuilder()
      .withState({})
      .createForm('a', labelForm('Only'))
      .createStep((s) => s.createPage((p) => p.addForm('a'), { heading: 'Heading X' }))
      .build();
}

describe('StepperComponent — stepper adapter', () => {
  it('renders the chrome provided via provideFormadSuite({ stepper })', async () => {
    TestBed.configureTestingModule({ providers: [provideFormadSuite({ stepper: CustomChrome })] });
    const fixture = TestBed.createComponent(ChromeHost);
    await settle(fixture);

    const chrome = fixture.nativeElement.querySelector('.x-chrome');
    expect(chrome).toBeTruthy();
    // The custom chrome read the controller's heading signal.
    expect(chrome.textContent).toContain('Heading X');
  });
});

// Counts every model-factory call, which happens exactly once per materialization
// — so a non-zero count means a step's forms were actually built.
const built = { a: 0, c: 0 };
const countingForm = (label: string, tick: () => void): FormConfig<Labelled> => ({
  model: () => {
    tick();
    return { v: '' };
  },
  ui: UiFormConfigBuilder.from({ v: '' }).v(text(label)),
});

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class LazyHost {
  readonly stepper: RuntimeStepper =     new StepperBuilder()
      .withState({})
      .createForm('a', countingForm('First', () => built.a++))
      .createForm('c', countingForm('Third', () => built.c++))
      .createStep((s) => s.createPage((p) => p.addForm('a'), { heading: '1' }))
      .createStep((s) => s.createPage((p) => p.addForm('c'), { heading: '2' }))
      .build();
}

describe('StepperComponent — laziness', () => {
  it('materializes only the current step; later steps are untouched until reached', async () => {
    built.a = 0;
    built.c = 0;
    const fixture = TestBed.createComponent(LazyHost);
    await settle(fixture);

    // Step 1 built; step 2 never instantiated yet.
    expect(built.a).toBe(1);
    expect(built.c).toBe(0);

    buttonByText(fixture, 'Next')!.click();
    await settle(fixture);

    // Now step 2 built — and exactly once.
    expect(built.c).toBe(1);
  });
});

type KindModel = { kind: string };
const kindForm: FormConfig<KindModel> = {
  model: () => ({ kind: '' }),
  ui: UiFormConfigBuilder.from({ kind: '' }).kind(text('Kind')),
};

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" (completed)="done = $event" />`,
})
class ForkHost {
  done: unknown = undefined;
  readonly stepper: RuntimeStepper =     new StepperBuilder()
      .withState({ kind: '' })
      .createForm('start', kindForm)
      .createStep((s) =>
        s.createPage((p) =>
          p.addForm('start', { fieldValueBindings: (f, s) => [link(f.kind, s.kind)] }), { heading: 'Start' },
        ),
      )
      .fork((c) => c.shared.kind(), {
        business: (arm) =>
          arm
            .createForm('company', labelForm('Company'))
            .createStep((s) => s.createPage((p) => p.addForm('company'), { heading: 'Company' }), { name: 'company' }),
        individual: (arm) =>
          arm
            .createForm('person', labelForm('Person'))
            .createStep((s) => s.createPage((p) => p.addForm('person'), { heading: 'Person' }), { name: 'person' }),
      })
      .build();
}

describe('StepperComponent — fork', () => {
  it('navigates the chosen arm and emits its result on finish', async () => {
    const fixture = TestBed.createComponent(ForkHost);
    await settle(fixture);

    // The forward (Back-aside) button — its label is Next/Finish depending on the
    // committed sequence, so target it positionally.
    const forward = () => {
      const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
      return buttons[buttons.length - 1];
    };

    // Choose the business arm on the start step.
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'business';
    input.dispatchEvent(new Event('input'));
    await settle(fixture);

    forward().click(); // commit kind → the business arm becomes visible → enter it
    await settle(fixture);
    expect(fixture.nativeElement.textContent).toContain('Company');

    forward().click(); // last step of the arm → completes
    await settle(fixture);

    expect(fixture.componentInstance.done).toEqual({ business: { company: { company: { v: '' } } } });
  });
});
