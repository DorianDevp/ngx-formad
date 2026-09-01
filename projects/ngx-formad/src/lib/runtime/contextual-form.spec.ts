import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiFormConfigBuilder, text } from 'formodel';
import { asStepper, StepperBuilder } from '../builders/stepper-builder';
import { FormConfig } from '../form-config/form-config';
import { provideFormadSuite } from '../provide';
import { StepFormsView } from './step-forms-view';
import { StepperController } from './stepper-controller';
import { StepperComponent } from './stepper.component';

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

type One = { v: string };

const oneForm = (label: string): FormConfig<One> => ({
  model: () => ({ v: '' }),
  ui: UiFormConfigBuilder.from({ v: '' }).v(text(label)),
});

@Component({
  selector: 'ctx-chrome',
  imports: [StepFormsView],
  template: `
    @let c = controller();
    @if (c.step(); as step) {
      <ngx-formad-step-forms [step]="step" />
    }
    <button type="button" class="next" (click)="c.next()">Next</button>
    <button type="button" class="back" (click)="c.back()">Back</button>
    <button type="button" class="again" (click)="c.goTo('Details', { fresh: true })">Again</button>
  `,
})
class CtxChrome {
  readonly controller = input.required<StepperController>();
}

// The details form's SHAPE is built from the pick committed a step before — the
// factory runs when the step is reached, synchronously, with the live context.
@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class CtxHost {
  builds = 0;

  readonly stepper = asStepper(
    new StepperBuilder()
      .withState({ pick: '' })
      .createForm('pick', oneForm('Pick'))
      .createForm('details', {
        build: (ctx) => {
          this.builds = this.builds + 1;

          return oneForm(`Details for ${ctx.shared.pick || 'nobody'}`);
        },
      })
      .createStep(
        (s) =>
          s.createPage({ options: { heading: 'Pick' } }, (p) =>
            p.addForm(
              (f) => f.pick,
              { bind: (l) => l.link((m) => m.v, (sh) => sh.pick) },
            ),
          ),
        { label: 'Pick' },
      )
      .createStep(
        (s) => s.createPage({ options: { heading: 'Details' } }, (p) => p.addForm((f) => f.details)),
        { label: 'Details' },
      )
      .build(),
  );
}

describe('ContextualForm - a form built from the live context', () => {
  let fixture: ComponentFixture<CtxHost>;

  const click = async (selector: string) => {
    (fixture.nativeElement.querySelector(selector) as HTMLButtonElement).click();
    await settle(fixture);
  };
  const type = async (value: string) => {
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const label = () =>
    (fixture.nativeElement.querySelector('label') as HTMLElement).textContent.trim();

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideFormadSuite({ stepper: CtxChrome })] });
    fixture = TestBed.createComponent(CtxHost);
    await settle(fixture);
  });

  it('builds the form from the values committed before it, with no loading frame', async () => {
    await type('havaco');
    await click('.next');

    expect(label()).toBe('Details for havaco');
    expect(fixture.componentInstance.builds).toBe(1);
  });

  it('keeps the built instance on a revisit, and rebuilds only when asked fresh', async () => {
    await type('havaco');
    await click('.next');
    await click('.back');
    await click('.next');
    expect(fixture.componentInstance.builds).toBe(1);

    await click('.back');
    await type('komfovent');
    await click('.again');

    expect(label()).toBe('Details for komfovent');
    expect(fixture.componentInstance.builds).toBe(2);
  });
});
