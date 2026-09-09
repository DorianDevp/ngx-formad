import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { text, UiFormConfigBuilder } from 'formodel';
import { FormRevisit, StepRevisit } from '../builders/nodes';
import { RuntimeStepper, StepperBuilder } from '../builders/stepper-builder';
import { FormConfig } from '../form-config/form-config';
import { StepperComponent } from './stepper.component';

// What a revisited step does with `initial` is the author's call, per placement: by default the
// instance stays as the user left it; a form may reseed its untouched fields from the current
// context; a step may come back fresh. Driven through the default chrome's Back and Next.

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

interface Journey {
  readonly stepper: RuntimeStepper;
  readonly initialCalls: () => number;
}

/** Maker feeds Details through `initial`; the two policies under test sit on the Details placement and step. */
function journey(form?: FormRevisit, step?: StepRevisit): Journey {
  let calls = 0;
  const stepper = new StepperBuilder()
    .createForm('maker', oneForm('Maker'))
    .createForm('details', oneForm('Details'))
    .createStep((s) => s.createPage((p) => p.addForm('maker'), { heading: 'Maker' }), { name: 'maker' })
    .createStep(
      (s) =>
        s.createPage(
          (p) =>
            p.addForm('details', null, {
              initial: ({ steps }) => {
                calls += 1;

                return { v: steps.maker.maker.model().v };
              },
              revisit: form,
            }),
          { heading: 'Details' },
        ),
      { revisit: step },
    )
    .build();

  return { stepper, initialCalls: () => calls };
}

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper()" />`,
})
class RevisitHost {
  readonly stepper = input.required<RuntimeStepper>();
}

describe('A revisited step and its initial seed', () => {
  let fixture: ComponentFixture<RevisitHost>;

  const root = () => fixture.nativeElement as HTMLElement;
  const field = () => root().querySelector('input') as HTMLInputElement;
  const heading = () => root().querySelector('.ngx-formad-heading')?.textContent?.trim();
  const press = async (label: string) => {
    Array.from(root().querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === label)!
      .click();
    await settle(fixture);
  };
  const type = async (value: string) => {
    field().value = value;
    field().dispatchEvent(new Event('input'));
    await settle(fixture);
  };

  async function start(run: Journey): Promise<void> {
    fixture = TestBed.createComponent(RevisitHost);
    fixture.componentRef.setInput('stepper', run.stepper);
    await settle(fixture);
    await type('Acme');
    await press('Next');
    expect(heading()).toBe('Details');
    expect(field().value).toBe('Acme');
    expect(run.initialCalls()).toBe(1);
  }

  it('keeps the instance as it was by default: Maker changes, Details does not follow', async () => {
    const run = journey();
    await start(run);

    await press('Back');
    await type('Beta');
    await press('Next');

    expect(field().value).toBe('Acme');
    expect(run.initialCalls()).toBe(1);
  });

  it('reseeds an untouched field from the current context, and leaves an edited one alone', async () => {
    const run = journey(FormRevisit.Reseed);
    await start(run);

    await press('Back');
    await type('Beta');
    await press('Next');
    expect(field().value).toBe('Beta');

    await type('Custom');
    await press('Back');
    await type('Gamma');
    await press('Next');
    expect(field().value).toBe('Custom');
  });

  it('builds a fresh step on every entry: the seed is current and an edit does not survive', async () => {
    const run = journey(undefined, StepRevisit.Fresh);
    await start(run);

    await type('Custom');
    await press('Back');
    await type('Beta');
    await press('Next');

    expect(field().value).toBe('Beta');
    expect(run.initialCalls()).toBe(2);
  });
});
