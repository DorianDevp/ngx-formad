import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { select, text, UiFormConfigBuilder } from 'formodel';
import { provideFormadSuite } from '../provide';
import { RuntimeStepper, StepperBuilder } from '../builders/stepper-builder';
import { FormConfig } from '../form-config/form-config';
import { StepFormsView } from './step-forms-view';
import { StepperController } from './stepper-controller';
import { StepperComponent } from './stepper.component';

// The front where it meets the rest of the runtime: a nested flow, a step with a lazy form, `goTo`, `reset`,
// and a branch inside a branch - each a place where "entered" has to mean the right thing.

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

/** A loader settles over a chain of microtasks: give it a turn, then let the view catch up. */
async function resolved(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve));
  await settle(fixture);
}

type Fulfilment = 'delivery' | 'pickup';
type Cart = { fulfilment: Fulfilment | null };
const cartForm: FormConfig<Cart> = {
  model: () => ({ fulfilment: null }),
  // The seed only shapes the builder (a null key gets no field method); `model` holds the unanswered state.
  ui: UiFormConfigBuilder.from({ fulfilment: 'pickup' as Fulfilment | null }).fulfilment(
    select('Fulfilment', [
      { value: 'delivery', description: 'Deliver to my address' },
      { value: 'pickup', description: 'Pick up in store' },
    ]),
  ),
};

type Taxation = 'vat' | 'novat';
type Company = { taxation: Taxation | null };
const companyForm: FormConfig<Company> = {
  model: () => ({ taxation: null }),
  ui: UiFormConfigBuilder.from({ taxation: 'vat' as Taxation | null }).taxation(
    select('Taxation', [
      { value: 'vat', description: 'VAT payer' },
      { value: 'novat', description: 'Not a VAT payer' },
    ]),
  ),
};

type One = { v: string };
const oneForm = (label: string): FormConfig<One> => ({
  model: () => ({ v: '' }),
  ui: UiFormConfigBuilder.from({ v: '' }).v(text(label)),
});

@Component({
  selector: 'edges-chrome',
  imports: [StepFormsView],
  template: `
    @let c = controller();
    @if (c.step(); as step) {
      <ngx-formad-step-forms [step]="step" />
    }
    <span class="heading">{{ c.heading() }}</span>
    <span class="labels">{{ c.labels().join('|') }}</span>
    <button class="next" (click)="c.next()">Next</button>
    <button class="back" (click)="c.back()">Back</button>
    <button class="promo" (click)="c.goTo('Promo')">Promo</button>
    <button class="reset" (click)="c.reset()">Reset</button>
  `,
})
class EdgesChrome {
  readonly controller = input.required<StepperController>();
}

// Cart, then the gift flow as ONE slot, then Express (gated on the cart), Notes (a lazy form), Promo (gated on
// Notes, read unguarded) and Payment.
@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class CheckoutHost {
  readonly stepper: RuntimeStepper = new StepperBuilder()
    .withState({})
    .createForm('cart', cartForm)
    .createForm('payment', oneForm('Payment'))
    .createStep((s) => s.createPage((p) => p.addForm('cart'), { heading: 'Cart' }), { name: 'cart', label: 'Cart' })
    .createStepper('gift', {
      label: 'Gift',
      build: (sub) =>
        sub
          .createForm('card', oneForm('Card'))
          .createForm('wrap', oneForm('Wrap'))
          .createStep((s) => s.createPage((p) => p.addForm('card'), { heading: 'Card' }), { name: 'card', label: 'Card' })
          .createStep((s) => s.createPage((p) => p.addForm('wrap'), { heading: 'Wrap' }), { name: 'wrap', label: 'Wrap' }),
    })
    .createStep((s) => s.createPage((p) => p.addForm('express', oneForm('Express')), { heading: 'Express' }), {
      name: 'express',
      label: 'Express',
      activeWhen: (ctx) => ctx.steps.cart.cart.model().fulfilment === 'delivery',
    })
    .createStep(
      (s) => s.createPage((p) => p.addForm('notes', () => Promise.resolve(oneForm('Notes'))), { heading: 'Notes' }),
      { name: 'notes', label: 'Notes' },
    )
    .createStep((s) => s.createPage((p) => p.addForm('promo', oneForm('Promo')), { heading: 'Promo' }), {
      name: 'promo',
      label: 'Promo',
      // Notes is ungated, so it is there when this gate is asked - even though its form arrives late.
      activeWhen: (ctx) => ctx.steps.notes.notes.model().v !== 'no promo',
    })
    .createStep((s) => s.createPage((p) => p.addForm('payment'), { heading: 'Payment' }), { label: 'Payment' })
    .build();
}

describe('The front across the runtime', () => {
  let fixture: ComponentFixture<CheckoutHost>;

  const read = (selector: string) => (fixture.nativeElement.querySelector(selector) as HTMLElement).textContent!.trim();
  const click = async (selector: string) => {
    (fixture.nativeElement.querySelector(selector) as HTMLButtonElement).click();
    await settle(fixture);
  };
  const choose = async (fulfilment: Fulfilment) => {
    const control = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    control.value = String(['delivery', 'pickup'].indexOf(fulfilment));
    control.dispatchEvent(new Event('change'));
    await settle(fixture);
  };
  /** Cart → Card → Wrap → Express → Notes, the loader settled. */
  const walkToNotes = async () => {
    await choose('delivery');
    await click('.next');
    await click('.next');
    await click('.next');
    expect(read('.heading')).toBe('Express');
    await click('.next');
    await resolved(fixture);
    expect(read('.heading')).toBe('Notes');
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideFormadSuite({ stepper: EdgesChrome })] });
    fixture = TestBed.createComponent(CheckoutHost);
    await settle(fixture);
  });

  it('keeps a gate past a nested flow undecided until the flow has shown a step', async () => {
    expect(read('.labels')).toBe('Cart|Gift|Notes|Payment');

    await choose('delivery');
    expect(read('.labels')).toBe('Cart|Gift|Notes|Payment'); // Express reads the cart, but Gift is still ahead

    await click('.next');
    expect(read('.heading')).toBe('Card');
    expect(read('.labels')).toBe('Cart|Gift|Express|Notes|Payment');
  });

  it('decides a gate reading a lazy predecessor only once that step is alive', async () => {
    await walkToNotes();

    expect(read('.labels')).toBe('Cart|Gift|Express|Notes|Promo|Payment');
  });

  it('refuses goTo onto an undecided step, and lands once it is decided', async () => {
    await click('.promo');
    expect(read('.heading')).toBe('Cart');

    await walkToNotes();
    await click('.promo');
    expect(read('.heading')).toBe('Promo');
  });

  it('closes the front again on reset', async () => {
    await choose('delivery');
    await click('.next');
    await click('.next');
    await click('.next');
    expect(read('.heading')).toBe('Express');

    await click('.reset');
    expect(read('.heading')).toBe('Cart');
    expect(read('.labels')).toBe('Cart|Gift|Notes|Payment');
  });
});

// A branch inside a branch arm: the inner selector reads the outer arm's own step, unguarded.
let outerAsked = 0;
let innerAsked = 0;

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class AccountHost {
  readonly stepper: RuntimeStepper = new StepperBuilder()
    .withState({ kind: 'business' as 'business' | 'private' })
    .createForm('start', oneForm('Start'))
    .createForm('done', oneForm('Done'))
    .createStep((s) => s.createPage((p) => p.addForm('start'), { heading: 'Start' }), { name: 'start', label: 'Start' })
    .branch(
      (c) => {
        outerAsked++;
        return c.shared.kind();
      },
      {
        business: (b) =>
          b
            .createStep((s) => s.createPage((p) => p.addForm('company', companyForm), { heading: 'Company' }), {
              name: 'company',
              label: 'Company',
            })
            .branch(
              (ctx) => {
                innerAsked++;
                return ctx.steps.company.company.model().taxation;
              },
              {
                vat: (bb) =>
                  bb.createStep((s) => s.createPage((p) => p.addForm('vat', oneForm('VAT')), { heading: 'VAT' }), {
                    name: 'vat',
                    label: 'VAT',
                  }),
                novat: (bb) =>
                  bb.createStep((s) => s.createPage((p) => p.addForm('novat', oneForm('No VAT')), { heading: 'No VAT' }), {
                    name: 'novat',
                    label: 'No VAT',
                  }),
              },
            ),
        private: (b) =>
          b.createStep((s) => s.createPage((p) => p.addForm('person', oneForm('Person')), { heading: 'Person' }), {
            name: 'person',
            label: 'Person',
          }),
      },
    )
    .createStep((s) => s.createPage((p) => p.addForm('done'), { heading: 'Done' }), { label: 'Done' })
    .build();
}

describe('A branch inside a branch arm', () => {
  let fixture: ComponentFixture<AccountHost>;

  const read = (selector: string) => (fixture.nativeElement.querySelector(selector) as HTMLElement).textContent!.trim();
  const click = async (selector: string) => {
    (fixture.nativeElement.querySelector(selector) as HTMLButtonElement).click();
    await settle(fixture);
  };
  const choose = async (taxation: Taxation) => {
    const control = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    control.value = String(['vat', 'novat'].indexOf(taxation));
    control.dispatchEvent(new Event('change'));
    await settle(fixture);
  };
  /** How many times each selector was asked since the last look. */
  const asked = () => {
    const counts = { outer: outerAsked, inner: innerAsked };
    outerAsked = 0;
    innerAsked = 0;
    return counts;
  };

  beforeEach(async () => {
    outerAsked = 0;
    innerAsked = 0;
    TestBed.configureTestingModule({ providers: [provideFormadSuite({ stepper: EdgesChrome })] });
    fixture = TestBed.createComponent(AccountHost);
    await settle(fixture);
  });

  it('asks the inner selector only once the outer arm’s step is entered', async () => {
    expect(read('.labels')).toBe('Start|Company|Done');
    expect(asked()).toEqual({ outer: 1, inner: 0 }); // one walk decided the outer arm; Company is still ahead

    await click('.next');
    expect(read('.heading')).toBe('Company');
    expect(read('.labels')).toBe('Start|Company|Done'); // decided: null names no inner arm
    expect(asked()).toEqual({ outer: 1, inner: 1 });

    await choose('vat');
    expect(read('.labels')).toBe('Start|Company|VAT|Done');
    expect(asked()).toEqual({ outer: 1, inner: 1 }); // the answer changed: one walk, each selector once
  });

  it('decides nothing again when moving between steps already alive', async () => {
    await click('.next');
    await choose('novat');
    await click('.next');
    expect(read('.heading')).toBe('No VAT');
    asked();

    await click('.back');
    expect(read('.heading')).toBe('Company');
    expect(asked()).toEqual({ outer: 0, inner: 0 });
  });
});
