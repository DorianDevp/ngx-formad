import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiFormConfigBuilder, text } from 'formodel';
import { RuntimeStepper, StepperBuilder } from '../builders/stepper-builder';
import { FormConfig } from '../form-config/form-config';
import { provideFormadSuite } from '../provide';
import { StepFormsView } from './step-forms-view';
import { StepperController } from './stepper-controller';
import { StepperComponent } from './stepper.component';

// `StepFormsView` is the forms-only building block a bring-your-own chrome drops
// in. It has to honour the same `visibleWhen` the completion fold does, or a chrome
// built on it shows a form that cannot count towards Next.

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

type Only = { v: string };
const only = (label: string): FormConfig<Only> => ({
  model: () => ({ v: '' }),
  ui: UiFormConfigBuilder.from({ v: '' }).v(text(label)),
});

@Component({
  selector: 'x-forms-chrome',
  imports: [StepFormsView],
  template: `
    @if (controller().step(); as step) {
      <ngx-formad-step-forms [step]="step" />
    }
  `,
})
class FormsChrome {
  readonly controller = input.required<StepperController>();
}

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class Host {
  readonly stepper: RuntimeStepper =     new StepperBuilder()
      .withState({})
      .createForm('shown', only('Shown field'))
      .createForm('gone', only('Hidden field'))
      .createStep((s) =>
        s.createPage({ options: { heading: 'Step' } }, (p) =>
          p.addForm('shown').addForm('gone', { visibleWhen: () => false }),
        ),
      )
      .build();
}

describe('StepFormsView', () => {
  it('draws the visible forms only', async () => {
    TestBed.configureTestingModule({ providers: [provideFormadSuite({ stepper: FormsChrome })] });
    const fixture = TestBed.createComponent(Host);
    await settle(fixture);

    expect(fixture.nativeElement.textContent).toContain('Shown field');
    expect(fixture.nativeElement.textContent).not.toContain('Hidden field');
    expect(fixture.nativeElement.querySelectorAll('input')).toHaveLength(1);
  });
});
