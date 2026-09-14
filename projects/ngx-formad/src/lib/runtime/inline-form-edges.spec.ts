import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { text, UiFormConfigBuilder } from 'formodel';
import { provideFormadSuite } from '../provide';
import { RuntimeStepper, StepPages, StepperBuilder } from '../builders/stepper-builder';
import { link } from '../builders/shared-link';
import { FormConfig } from '../form-config/form-config';
import { StepFormsView } from './step-forms-view';
import { StepperController } from './stepper-controller';
import { StepperComponent } from './stepper.component';

// A template given at the page in every place a pool form goes: linked to the store, seeded from a predecessor,
// inside a row, chosen on entry - and refused wherever a step would hold one name twice.

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

type Address = { street: string };
const address = (label: string): FormConfig<Address> => ({
  model: () => ({ street: '' }),
  ui: UiFormConfigBuilder.from({ street: '' }).street(text(label)),
});

type One = { v: string };
const oneForm = (label: string): FormConfig<One> => ({
  model: () => ({ v: '' }),
  ui: UiFormConfigBuilder.from({ v: '' }).v(text(label)),
});

type Wrap = 'plain' | 'gift';
const wraps: Record<Wrap, FormConfig<One>> = { plain: oneForm('Plain paper'), gift: oneForm('Gift paper') };

@Component({
  selector: 'edge-chrome',
  imports: [StepFormsView],
  template: `
    @let c = controller();
    @if (c.step(); as step) {
      <ngx-formad-step-forms [step]="step" />
    }
    <span class="heading">{{ c.heading() }}</span>
    <button class="next" (click)="c.next()">Next</button>
  `,
})
class EdgeChrome {
  readonly controller = input.required<StepperController>();
}

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class OrderHost {
  readonly stepper = new StepperBuilder()
    .withState({ street: '', wrap: 'plain' as Wrap })
    // Linked to the store like a pool form would be.
    .createStep(
      (s) =>
        s.createPage(
          (p) => p.addForm('address', address('Home street'), { fieldValueBindings: (f, sh) => [link(f.street, sh.street)] }),
          { heading: 'Where' },
        ),
      { name: 'where' },
    )
    // Seeded from the predecessor's own template; a second one inside a row.
    .createStep(
      (s) =>
        s.createPage(
          (p) =>
            p
              .addForm('billing', address('Billing street'), {
                initial: ({ steps }) => ({ street: steps.where.address.model().street }),
              })
              .insertRow((row) => row.addForm('note', oneForm('Note'))),
          { heading: 'Billing' },
        ),
      { name: 'billing' },
    )
    // Chosen on entry from the live context.
    .createStep((step, ctx) => step.createPage((p) => p.addForm('wrap', wraps[ctx.shared.wrap()]), { heading: 'Wrap' }), {
      name: 'wrap',
      pages: StepPages.OnEntry,
    })
    .build();
}

describe('A template given at the page, wherever a pool form goes', () => {
  let fixture: ComponentFixture<OrderHost>;

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const read = (selector: string) => (fixture.nativeElement.querySelector(selector) as HTMLElement).textContent!.trim();
  const inputs = () => Array.from(fixture.nativeElement.querySelectorAll('input') as NodeListOf<HTMLInputElement>);
  const type = async (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle(fixture);
  };
  const next = async () => {
    (fixture.nativeElement.querySelector('.next') as HTMLButtonElement).click();
    await settle(fixture);
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideFormadSuite({ stepper: EdgeChrome })] });
    fixture = TestBed.createComponent(OrderHost);
    await settle(fixture);
  });

  it('links its field to the store, written as the step commits', async () => {
    await type(inputs()[0], 'Long Street 1');
    await next();

    expect(fixture.componentInstance.stepper.shared.snapshot()['street']).toBe('Long Street 1');
  });

  it('seeds from a predecessor’s template, and sits inside a row', async () => {
    await type(inputs()[0], 'Long Street 1');
    await next();

    expect(read('.heading')).toBe('Billing');
    expect(inputs()[0].value).toBe('Long Street 1');
    expect(text()).toContain('Note');
  });

  it('is chosen on entry from the live context', async () => {
    fixture.componentInstance.stepper.shared.patch({ wrap: 'gift' });
    await next();
    await next();

    expect(read('.heading')).toBe('Wrap');
    expect(text()).toContain('Gift paper');
    expect(text()).not.toContain('Plain paper');
  });
});

describe('A step holding one name twice', () => {
  const twice = 'places the form "a" twice';

  it('is refused across a row', () => {
    expect(() =>
      new StepperBuilder()
        .withState({})
        .createStep((s) =>
          s.createPage((p) => p.addForm('a', oneForm('A')).insertRow((row) => row.addForm('a', oneForm('A'))), { heading: 'Twice' }),
        ),
    ).toThrow(twice);
  });

  it('is refused across two pages', () => {
    expect(() =>
      new StepperBuilder()
        .withState({})
        .createStep((s) =>
          s
            .createPage((p) => p.addForm('a', oneForm('A')), { heading: 'One' })
            .createPage((p) => p.addForm('a', oneForm('A')), { heading: 'Two' }),
        ),
    ).toThrow(twice);
  });
});
