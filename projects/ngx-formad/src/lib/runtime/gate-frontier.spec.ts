import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiFormConfigBuilder, select, text } from 'formodel';
import { provideFormadSuite } from '../provide';
import { RuntimeStepper, StepperBuilder } from '../builders/stepper-builder';
import { FormConfig } from '../form-config/form-config';
import { StepFormsView } from './step-forms-view';
import { StepperController } from './stepper-controller';
import { StepperComponent } from './stepper.component';

// A branch two steps ahead is decided on the cart's answer, read without a guard: the
// answer IS the arm's key, so a step appears only for the value that names it - null
// names none. The controller must not ask before the cart exists, and must list an arm
// on the rail only once the steps before the branch are entered.

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
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

type One = { v: string };
const oneForm = (label: string): FormConfig<One> => ({
  model: () => ({ v: '' }),
  ui: UiFormConfigBuilder.from({ v: '' }).v(text(label)),
});

@Component({
  selector: 'front-chrome',
  imports: [StepFormsView],
  template: `
    @let c = controller();
    @if (c.step(); as step) {
      <ngx-formad-step-forms [step]="step" />
    }
    <span class="heading">{{ c.heading() }}</span>
    <span class="total">{{ c.total() }}</span>
    <span class="labels">{{ c.labels().join('|') }}</span>
    <button class="next" (click)="c.next()">Next</button>
    <button class="back" (click)="c.back()">Back</button>
  `,
})
class FrontChrome {
  readonly controller = input.required<StepperController>();
}

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class CheckoutHost {
  readonly stepper: RuntimeStepper = new StepperBuilder()
    .withState({})
    .createForm('cart', cartForm)
    .createForm('notes', oneForm('Notes'))
    .createForm('address', oneForm('Address'))
    .createForm('store', oneForm('Store'))
    .createForm('payment', oneForm('Payment'))
    .createStep((s) => s.createPage((p) => p.addForm('cart'), { heading: 'Cart' }), { name: 'cart', label: 'Cart' })
    .createStep((s) => s.createPage((p) => p.addForm('notes'), { heading: 'Notes' }), { name: 'notes', label: 'Notes' })
    // The cart's answer names the arm; the selector reads it unguarded.
    .branch((ctx) => ctx.steps.cart.cart.model().fulfilment, {
      delivery: (b) =>
        b.createStep((s) => s.createPage((p) => p.addForm('address'), { heading: 'Address' }), {
          name: 'address',
          label: 'Address',
        }),
      pickup: (b) =>
        b.createStep((s) => s.createPage((p) => p.addForm('store'), { heading: 'Store' }), {
          name: 'store',
          label: 'Store',
        }),
    })
    .createStep((s) => s.createPage((p) => p.addForm('payment'), { heading: 'Payment' }), { label: 'Payment' })
    .build();
}

describe('A branch decided on a predecessor’s answer', () => {
  let fixture: ComponentFixture<CheckoutHost>;

  const read = (selector: string) => (fixture.nativeElement.querySelector(selector) as HTMLElement).textContent!.trim();
  const click = async (selector: string) => {
    (fixture.nativeElement.querySelector(selector) as HTMLButtonElement).click();
    await settle(fixture);
  };
  // The rendered <select> lists the options by index.
  const choose = async (fulfilment: Fulfilment) => {
    const control = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    control.value = String(['delivery', 'pickup'].indexOf(fulfilment));
    control.dispatchEvent(new Event('change'));
    await settle(fixture);
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideFormadSuite({ stepper: FrontChrome })] });
    fixture = TestBed.createComponent(CheckoutHost);
    await settle(fixture);
  });

  it('opens on the cart without asking the branch', () => {
    expect(read('.heading')).toBe('Cart');
    // Notes is listed but not entered: the branch past it is undecided; Payment is ungated.
    expect(read('.labels')).toBe('Cart|Notes|Payment');
    expect(read('.total')).toBe('3');
  });

  it('keeps the branch undecided until the steps before it are entered', async () => {
    await choose('pickup');
    expect(read('.labels')).toBe('Cart|Notes|Payment'); // answered, but Notes still ahead

    await click('.next');
    expect(read('.heading')).toBe('Notes');
    expect(read('.labels')).toBe('Cart|Notes|Store|Payment');
    expect(read('.total')).toBe('4');
  });

  it('lists no arm while the answer names none, and rejoins past the branch', async () => {
    await click('.next');
    expect(read('.heading')).toBe('Notes');
    expect(read('.labels')).toBe('Cart|Notes|Payment'); // decided: null selects no arm

    await click('.next');
    expect(read('.heading')).toBe('Payment');
  });

  it('creates the step the answer names', async () => {
    await choose('delivery');
    await click('.next');
    await click('.next');

    expect(read('.heading')).toBe('Address');
    expect(read('.labels')).toBe('Cart|Notes|Address|Payment');
  });

  it('creates the other step once the answer changes', async () => {
    await choose('delivery');
    await click('.next');
    await click('.next');
    expect(read('.heading')).toBe('Address');

    await click('.back');
    await click('.back');
    await choose('pickup');
    await click('.next');
    await click('.next');

    expect(read('.heading')).toBe('Store');
    expect(read('.labels')).toBe('Cart|Notes|Store|Payment');
  });
});
