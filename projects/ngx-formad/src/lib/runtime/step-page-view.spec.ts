import { Component, input, inputBinding, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiFormConfigBuilder, text } from 'formodel';
import { RuntimeStepper, StepperBuilder } from '../builders/stepper-builder';
import { FormConfig } from '../form-config/form-config';
import { StepperComponent } from './stepper.component';

// Proves the page renderer the chrome now uses draws a step's *whole* tree —
// dynamic components beside forms, and a component-only step gated by
// `completeWhen` — not just the flat form list.

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

function buttonByText(fixture: ComponentFixture<unknown>, label: string): HTMLButtonElement | undefined {
  return Array.from(
    fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
  ).find((b) => b.textContent?.trim() === label);
}

@Component({ selector: 'x-banner', template: `<div class="x-banner">{{ note() }}</div>` })
class Banner {
  readonly note = input('');
}

type Only = { v: string };
const onlyForm: FormConfig<Only> = {
  model: () => ({ v: '' }),
  ui: UiFormConfigBuilder.from({ v: '' }).v(text('Field')),
};

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class ComponentHost {
  readonly stepper: RuntimeStepper =     new StepperBuilder()
      .withState({})
      .createForm('only', onlyForm)
      .createStep((s) =>
        s.createPage((p) =>
          p.addComponent(Banner, { bindings: [inputBinding('note', () => 'hello from a slot')] }).addForm('only'), { heading: 'One' },
        ),
      )
      .build();
}

describe('StepPageView — dynamic components', () => {
  it('renders a page component alongside the form', async () => {
    const fixture = TestBed.createComponent(ComponentHost);
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('input')).toBeTruthy();
    const banner = fixture.nativeElement.querySelector('.x-banner');
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain('hello from a slot');
  });
});

// A component-only step: no forms to fold, so it is vacuously complete — the
// `completeWhen` gate is what holds Next until the host's signal flips.
const ready = signal(false);

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class GatedHost {
  readonly stepper: RuntimeStepper =     new StepperBuilder()
      .withState({})
      .createStep(
        (s) => s.createPage((p) => p.addComponent(Banner, { bindings: [inputBinding('note', () => 'choose')] }), { heading: 'Pick' }),
        { completeWhen: () => ready() },
      )
      .createStep((s) => s.createPage((p) => p.addComponent(Banner, { bindings: [inputBinding('note', () => 'done')] }), { heading: 'Done' }))
      .build();
}

describe('StepPageView — completeWhen gate', () => {
  it('gates Next on a component-only step until the guard passes', async () => {
    ready.set(false);
    const fixture = TestBed.createComponent(GatedHost);
    await settle(fixture);

    expect(buttonByText(fixture, 'Next')!.getAttribute('aria-disabled')).toBe('true');

    ready.set(true);
    await settle(fixture);

    expect(buttonByText(fixture, 'Next')!.getAttribute('aria-disabled')).toBe('false');
  });
});

// The guard receives the same context as `when`, so a component-only step can
// gate Next on the live shared state — no closed-over signal needed.
@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class SharedGatedHost {
  readonly built = new StepperBuilder()
    .withState({ agreed: false })
    .createStep(
      (s) => s.createPage((p) => p.addComponent(Banner, { bindings: [inputBinding('note', () => 'agree')] }), { heading: 'Consent' }),
      { completeWhen: (ctx) => ctx.shared.agreed() },
    )
    .createStep((s) => s.createPage((p) => p.addComponent(Banner, { bindings: [inputBinding('note', () => 'done')] }), { heading: 'Done' }))
    .build();
  readonly stepper: RuntimeStepper = (this.built);
}

describe('StepPageView — completeWhen context', () => {
  it('re-evaluates the guard when the shared state it reads changes', async () => {
    const fixture = TestBed.createComponent(SharedGatedHost);
    await settle(fixture);

    expect(buttonByText(fixture, 'Next')!.getAttribute('aria-disabled')).toBe('true');

    fixture.componentInstance.built.shared.patch({ agreed: true });
    await settle(fixture);

    expect(buttonByText(fixture, 'Next')!.getAttribute('aria-disabled')).toBe('false');
  });
});
