import { Component, computed, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiFormConfigBuilder, text } from 'formodel';
import { RuntimeStepper, StepperBuilder } from '../builders/stepper-builder';
import { FormConfig } from '../form-config/form-config';
import { provideFormadSuite } from '../provide';
import { StepperController } from './stepper-controller';
import { StepperComponent } from './stepper.component';

// A step's `label` and a page's `heading` are chrome text carried as data. The
// point of `labels` living on the controller is that it is derived from the SAME
// effective sequence as `index`/`total` - so a gated step leaves the rail and the
// count together, which a list kept outside the stepper cannot guarantee.

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

const withGiftWrap = signal(true);
const productCount = signal(2);

@Component({
  selector: 'x-probe',
  template: `<div class="x-rail">{{ controller().labels().join(' | ') }}</div>
    <div class="x-label">{{ controller().label() }}</div>
    <div class="x-heading">{{ controller().heading() }}</div>
    <div class="x-sub">{{ controller().subheading() }}</div>`,
})
class Probe {
  readonly controller = input.required<StepperController>();
}

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class LabelledHost {
  readonly stepper: RuntimeStepper =     new StepperBuilder()
      .withState({})
      .createForm('a', only('A'))
      .createForm('b', only('B'))
      .createStep(
        (s) =>
          s.createPage(
            (p) => p.addForm('a'),
        {
          heading: computed(() => `Pick products (${productCount()})`),
          subheading: 'Delivery comes next.',
        }
          ),
        { label: 'Products' },
      )
      .createStep(
        (s) => s.createPage((p) => p.addForm('b'), { heading: 'Gift wrap' }),
        {
          label: 'Gift options',
          activeWhen: () => withGiftWrap(),
        },
      )
      .createStep(
        (s) =>
          s.createPage((p) =>
            p.addContent((c) => c.p('All set.')), { heading: 'Review' },
          ),
        {
          label: 'Review',
        },
      )
      .build();
}

describe('Step labels', () => {
  beforeEach(() => {
    withGiftWrap.set(true);
    productCount.set(2);
  });

  it('exposes the effective steps’ labels and the current one', async () => {
    TestBed.configureTestingModule({ providers: [provideFormadSuite({ stepper: Probe })] });
    const fixture = TestBed.createComponent(LabelledHost);
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('.x-rail').textContent).toBe(
      'Products | Gift options | Review',
    );
    expect(fixture.nativeElement.querySelector('.x-label').textContent).toBe('Products');
  });

  it('drops a gated step from the rail, not just from the count', async () => {
    TestBed.configureTestingModule({ providers: [provideFormadSuite({ stepper: Probe })] });
    const fixture = TestBed.createComponent(LabelledHost);
    await settle(fixture);

    withGiftWrap.set(false);
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('.x-rail').textContent).toBe('Products | Review');
  });

  it('reads a reactive heading', async () => {
    TestBed.configureTestingModule({ providers: [provideFormadSuite({ stepper: Probe })] });
    const fixture = TestBed.createComponent(LabelledHost);
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('.x-heading').textContent).toBe('Pick products (2)');
    expect(fixture.nativeElement.querySelector('.x-sub').textContent).toBe('Delivery comes next.');

    productCount.set(5);
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('.x-heading').textContent).toBe('Pick products (5)');
  });

  it('is drawn by the bundled chrome - rail, heading, subheading', async () => {
    const fixture = TestBed.createComponent(LabelledHost);
    await settle(fixture);

    const rail = Array.from(
      fixture.nativeElement.querySelectorAll('.ngx-formad-rail-step') as NodeListOf<HTMLElement>,
    ).map((li) => li.textContent?.trim());
    expect(rail).toEqual(['Products', 'Gift options', 'Review']);

    const current = fixture.nativeElement.querySelector('.ngx-formad-rail-step.ngx-formad-current');
    expect(current.getAttribute('aria-current')).toBe('step');
    expect(fixture.nativeElement.querySelector('.ngx-formad-heading').textContent).toContain(
      'Pick products (2)',
    );
    expect(fixture.nativeElement.querySelector('.ngx-formad-subheading').textContent).toContain(
      'Delivery comes next.',
    );
  });
});
