import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiFormConfigBuilder, text } from 'formodel';
import { isStepNode } from '../builders/flow';
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
  selector: 'dyn-chrome',
  imports: [StepFormsView],
  template: `
    @let c = controller();
    @if (c.step(); as step) {
      <ngx-formad-step-forms [step]="step" />
    }
    <span class="heading">{{ c.heading() }}</span>
    <button type="button" class="next" (click)="c.next()">Next</button>
    <button type="button" class="back" (click)="c.back()">Back</button>
    <button type="button" class="again" (click)="c.goTo('Details', { fresh: true })">Again</button>
  `,
})
class DynChrome {
  readonly controller = input.required<StepperController>();
}

// The details step declares the SECOND callback parameter, so its structure is
// built on entry: which pooled form it places, and its heading, follow the pick
// committed a step before. The pool itself stays static declarations.
@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class DynHost {
  builds = 0;

  readonly stepper = asStepper(
    new StepperBuilder()
      .withState({ pick: '' })
      .createForm('pick', oneForm('Pick'))
      .createForm('cheap', oneForm('Cheap details'))
      .createForm('fancy', oneForm('Fancy details'))
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
        (s, ctx) => {
          // The counter only observes the runs for the assertions below; the
          // pages built from a given context are identical every time.
          this.builds = this.builds + 1;

          return s.createPage({ options: { heading: `Details: ${ctx.shared.pick()}` } }, (p) =>
            p.addForm((f) => (ctx.shared.pick() === 'fancy' ? f.fancy : f.cheap)),
          );
        },
        { label: 'Details' },
      )
      .build(),
  );
}

describe('Dynamic steps - the step callback with the live context', () => {
  let fixture: ComponentFixture<DynHost>;

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
  const heading = () =>
    (fixture.nativeElement.querySelector('.heading') as HTMLElement).textContent.trim();
  const fieldLabel = () =>
    (fixture.nativeElement.querySelector('label') as HTMLElement).textContent.trim();

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideFormadSuite({ stepper: DynChrome })] });
    fixture = TestBed.createComponent(DynHost);
    await settle(fixture);
  });

  it('keeps a one-parameter callback plain data, and defers a two-parameter one', () => {
    const steps = fixture.componentInstance.stepper.steps.filter(isStepNode);

    expect(typeof steps[0].pages).not.toBe('function');
    expect(typeof steps[1].pages).toBe('function');
    // Authoring ran no dynamic build; only reaching the step does.
    expect(fixture.componentInstance.builds).toBe(0);
  });

  it('builds the step from the answers committed before it, synchronously', async () => {
    await type('fancy');
    await click('.next');

    expect(heading()).toBe('Details: fancy');
    expect(fieldLabel()).toBe('Fancy details');
  });

  it('keeps the built structure on a revisit, and rebuilds only from a discard', async () => {
    await type('cheap');
    await click('.next');
    expect(fieldLabel()).toBe('Cheap details');
    const buildsAfterFirst = fixture.componentInstance.builds;

    await click('.back');
    await click('.next');
    expect(fixture.componentInstance.builds).toBe(buildsAfterFirst);

    await click('.back');
    await type('fancy');
    await click('.again');

    expect(heading()).toBe('Details: fancy');
    expect(fieldLabel()).toBe('Fancy details');
  });
});
