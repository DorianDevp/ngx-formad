import { Component, input, model } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormValueControl } from '@angular/forms/signals';
import { FormConfig } from './form-config/form-config';
import { FormRenderer } from './renderer/form-renderer';
import { asRenderable, instantiateForm } from './renderer/instantiate-form';
import { provideFormadSuite } from './provide';

// A user-defined control: `value` is the field binding, `props` is the typed bag
// the renderer forwards from the node (set via `customInputType` / a custom node).
@Component({ selector: 'stars-control', template: `<span class="stars">max {{ props().max }}</span>` })
class StarsControl implements FormValueControl<number> {
  value = model(0);
  props = input.required<{ max: number }>();
}

// A custom node (`type` is the registered kind, `props` the typed config). Built
// inline so the test doesn't depend on formodel's `customInputType` being present.
const config: FormConfig<{ rating: number }> = {
  model: () => ({ rating: 0 }),
  ui: { rating: { type: 'stars', props: { max: 5 } } } as unknown as FormConfig<{
    rating: number;
  }>['ui'],
};

@Component({
  imports: [FormRenderer],
  template: `<ngx-formad-form [state]="state" />`,
})
class Host {
  readonly state = asRenderable(instantiateForm(config));
}

async function pump(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

describe('Custom control kinds', () => {
  it('resolves a registered kind and forwards the node props', async () => {
    TestBed.configureTestingModule({
      providers: [provideFormadSuite({ controlTypes: { stars: StarsControl } })],
    });
    const fixture = TestBed.createComponent(Host);
    await pump(fixture);

    const stars = fixture.nativeElement.querySelector('.stars') as HTMLElement;
    expect(stars).toBeTruthy();
    expect(stars.textContent).toContain('max 5');
  });
});

// ── Per-stepper registration ──
import { asStepper, RuntimeStepper, StepperBuilder } from './builders/stepper-builder';
import { StepperComponent } from './runtime/stepper.component';

const starForm: FormConfig<{ rating: number }> = {
  model: () => ({ rating: 0 }),
  ui: { rating: { type: 'stars', props: { max: 7 } } } as unknown as FormConfig<{
    rating: number;
  }>['ui'],
};

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class StepperHost {
  // 'stars' is registered ON THE STEPPER (no global provideFormadSuite for it).
  readonly stepper: RuntimeStepper = asStepper(
    new StepperBuilder()
      .addControlType('stars', StarsControl)
      .createForm('f', starForm)
      .createStep((s) => s.createPage({ options: { heading: '1' } }, (p) => p.addForm((f) => f.f)))
      .build(),
  );
}

describe('Per-stepper control types', () => {
  it('resolves a wizard-scoped kind through the merged adapter', async () => {
    const fixture = TestBed.createComponent(StepperHost);
    for (let i = 0; i < 5; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
    const stars = fixture.nativeElement.querySelector('.stars') as HTMLElement | null;
    expect(stars?.textContent).toContain('max 7');
  });
});
