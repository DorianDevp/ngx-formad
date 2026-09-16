import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { text, UiFormConfigBuilder } from 'formodel';
import { FormConfig } from '../../form';
import { provideFormadSuite } from '../../provide';
import { RuntimeStepper, StepperBuilder } from '../builder/stepper-builder';
import { StepperController } from '../types/controller';
import { FormRevisit, StepRevisit } from '../types/nodes';
import { StepPageView } from '../ui/step-page-view';
import { StepperComponent } from '../ui/stepper.component';

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
            p.addForm('details', {
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

// A step reached with predecessors materialized in the same pass: `goTo` from step one lands on
// step three, and step two is brought to life on the way. `initial` must see it - the seed reads
// the navigation being built, not the one the controller last committed.
@Component({
  imports: [StepPageView],
  template: `
    @let c = controller();
    @if (c.step(); as step) {
      <ngx-formad-step-page [step]="step" />
    }
    <span class="heading">{{ c.heading() }}</span>
    <button type="button" class="jump" (click)="c.goTo('Last')">Jump</button>
  `,
})
class JumpChrome {
  readonly controller = input.required<StepperController>();
}

function jumpStepper(): RuntimeStepper {
  return new StepperBuilder()
    .createForm('first', oneForm('First'))
    .createForm('middle', oneForm('Middle'))
    .createForm('last', oneForm('Last'))
    .createStep((s) => s.createPage((p) => p.addForm('first'), { heading: 'First' }), { label: 'First' })
    .createStep(
      (s) =>
        s.createPage((p) => p.addForm('middle', { initial: () => ({ v: 'from the middle' }) }), { heading: 'Middle' }),
      { name: 'middle', label: 'Middle' },
    )
    .createStep(
      (s) =>
        s.createPage(
          // The predecessor is materialized in this very pass; its model has to be readable here.
          (p) => p.addForm('last', { initial: ({ steps }) => ({ v: steps.middle?.middle.model().v ?? 'nothing' }) }),
          { heading: 'Last' },
        ),
      { label: 'Last' },
    )
    .build();
}

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class JumpHost {
  readonly stepper = jumpStepper();
}

describe('A step entered with its predecessors', () => {
  it('seeds from the navigation being built, not the one last committed', async () => {
    TestBed.configureTestingModule({ providers: [provideFormadSuite({ stepper: JumpChrome })] });
    const fixture = TestBed.createComponent(JumpHost);
    await settle(fixture);

    const root = fixture.nativeElement as HTMLElement;
    (Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Jump') as HTMLButtonElement).click();
    await settle(fixture);

    expect(root.querySelector('.heading')?.textContent?.trim()).toBe('Last');
    expect((root.querySelector('input') as HTMLInputElement).value).toBe('from the middle');
  });
});
