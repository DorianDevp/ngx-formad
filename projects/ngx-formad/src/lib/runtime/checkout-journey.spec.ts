import { Component, computed, input, model } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormValueControl, hidden, required } from '@angular/forms/signals';
import { array, checkbox, customField, email, number, password, phone, radio, select, text, UiFormConfigBuilder } from 'formodel';
import { RuntimeStepper, StepperBuilder } from '../builders/stepper-builder';
import { defineForm, FormConfig } from '../form-config/form-config';
import { formLayout } from '../form-config/form-layout';
import { StepperComponent } from './stepper.component';

// One buyer's journey through a checkout, driven from the DOM the default chrome draws:
// a cart with a repeating group, a fork on how to buy, an arm with its own steps,
// a shipping form with a nested group, a schema-hidden field, a component of the
// author's own placed with control(), a content gate on shared state, a dynamic
// summary step, and the egress of every commit and of the arm's typed result.

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

type CartItem = { sku: string; qty: number };
type Cart = { items: CartItem[] };
const cartForm: FormConfig<Cart> = {
  model: () => ({ items: [{ sku: 'A', qty: 1 }] }),
  ui: UiFormConfigBuilder.from({ items: [] as CartItem[] }).items(
    array(UiFormConfigBuilder.from({ sku: '', qty: 0 }).sku(text('SKU')).qty(number('Qty')), {
      label: 'Items',
      addLabel: 'Add item',
      removeLabel: 'Remove',
    }),
  ),
};

type Mode = { mode: string };
const modeForm: FormConfig<Mode> = {
  model: () => ({ mode: '' }),
  ui: UiFormConfigBuilder.from({ mode: '' }).mode(
    radio(
      [
        { value: 'account', label: 'Create an account' },
        { value: 'guest', label: 'Buy as a guest' },
      ],
      { label: 'How do you want to buy?' },
    ),
  ),
};

type Account = { email: string; password: string };
const accountForm: FormConfig<Account> = {
  model: () => ({ email: '', password: '' }),
  ui: UiFormConfigBuilder.from({ email: '', password: '' }).email(email('Email')).password(password('Password')),
  schema: (p) => {
    required(p.email, { message: 'E-mail is required' });
    required(p.password, { message: 'Password is required' });
  },
};

type Contact = { email: string; phone: string };
const contactForm: FormConfig<Contact> = {
  model: () => ({ email: '', phone: '' }),
  ui: UiFormConfigBuilder.from({ email: '', phone: '' }).email(email('Email')).phone(phone('Phone')),
  schema: (p) => required(p.email, { message: 'E-mail is required' }),
};

/** A delivery window chosen from the ones the shop offers; placed with control(), so it is bound like any formField. */
@Component({
  selector: 'time-window-picker',
  template: `
    @for (window of windows(); track window) {
      <button type="button" class="window" [class.chosen]="value() === window" (click)="value.set(window)">{{ window }}</button>
    }
  `,
})
class TimeWindowPicker implements FormValueControl<string> {
  value = model('');
  windows = input<readonly string[]>([]);
}

type Shipping = {
  address: { street: string; city: string };
  method: string;
  locker: string;
  window: string;
  newsletter: boolean;
};
const shippingForm = defineForm({
  model: (): Shipping => ({ address: { street: '', city: '' }, method: 'courier', locker: '', window: '', newsletter: false }),
  ui: UiFormConfigBuilder.from({ address: { street: '', city: '' }, method: '', locker: '', window: '', newsletter: false })
    .address({ label: 'Address', maxCols: 2 }, (b) => b.street(text('Street')).city(text('City')))
    .method(
      select('Delivery', [
        { value: 'courier', description: 'Courier' },
        { value: 'locker', description: 'Parcel locker' },
        { value: 'pickup', description: 'Pick up in store' },
      ]),
    )
    .locker(text('Locker code'))
    .window(customField())
    .newsletter(checkbox('Send me the newsletter')),
  schema: (p) => {
    required(p.address.street, { message: 'Street is required' });
    hidden(p.locker, ({ valueOf }) => valueOf(p.method) !== 'locker');
  },
  layout: formLayout<Shipping>()
    .cols(2)
    .field('address', { colSpan: 2 })
    .field('method')
    .field('locker')
    .control('window', { component: TimeWindowPicker, placement: { colSpan: 2 } })
    .field('newsletter')
    .content((c) => c.p('We will e-mail the confirmation.', { className: 'confirm-note' }), {
      visibleWhen: (ctx) => (ctx.shared?.get('email') ?? '') !== '',
    })
    .build(),
});

const WINDOWS: readonly string[] = ['9-12', '12-15'];

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" (stepCommitted)="commits.push($event)" (completed)="done = $event" />`,
})
class CheckoutHost {
  readonly commits: Record<string, unknown>[] = [];
  done: unknown = undefined;
  readonly stepper: RuntimeStepper = new StepperBuilder()
    .withState({ mode: '', email: '' })
    .createForm('cart', cartForm)
    .createForm('mode', modeForm)
    .createForm('shipping', shippingForm) // both arms place it, so it is declared once, before the fork
    .createStep((s) => s.createPage((p) => p.addForm('cart'), { heading: 'Your cart' }), { name: 'cart' })
    .createStep((s) =>
      s.createPage((p) => p.addForm('mode', { bind: { mode: 'mode' } }), { heading: 'How to buy' }),
    )
    .fork((c) => c.shared.mode(), {
      account: (arm) =>
        arm
          .createForm('account', accountForm)
          .createStep((s) =>
            s.createPage((p) =>
              p.addForm('account', { bind: { email: 'email' } }), { heading: 'Create an account' },
            ),
          )
          .createStep((s) => s.createPage((p) => p.addForm('shipping', { bindings: { window: { inputs: { windows: WINDOWS } } } }), { heading: 'Shipping' }), {
            name: 'accountShipping',
          })
          .createStep((s, ctx) =>
            s.createPage((p) =>
              p.addContent((c) => c.p(computed(() => `Confirmation goes to ${ctx.shared.email()}`), { className: 'summary' })), { heading: 'Summary' },
            ),
            { dynamic: true },
          )
          .result(({ shared }) => ({ mode: 'account' as const, email: shared.email() })),
      guest: (arm) =>
        arm
          .createForm('contact', contactForm)
          .createStep((s) =>
            s.createPage((p) => p.addForm('contact', { bind: { email: 'email' } }), { heading: 'Your details' }),
          )
          .createStep((s) => s.createPage((p) => p.addForm('shipping', { bindings: { window: { inputs: { windows: WINDOWS } } } }), { heading: 'Shipping' }), {
            name: 'guestShipping',
          })
          .result(({ shared }) => ({ mode: 'guest' as const, email: shared.email() })),
    })
    .build();
}

type Commit = Record<string, Record<string, Record<string, unknown>>>;

describe('Checkout journey', () => {
  let fixture: ComponentFixture<CheckoutHost>;

  const root = () => fixture.nativeElement as HTMLElement;
  const all = <E extends Element>(selector: string) => Array.from(root().querySelectorAll<E>(selector));
  const buttonByText = (label: string) => all<HTMLButtonElement>('button').find((b) => b.textContent?.trim() === label);
  const forward = () => buttonByText('Next') ?? buttonByText('Finish');
  const inputs = () => all<HTMLInputElement>('input');
  const inputByLabel = (label: string) =>
    all<HTMLLabelElement>('label').find((l) => l.querySelector('span')?.textContent?.trim().startsWith(label))?.querySelector('input') as HTMLInputElement;
  const type = async (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle(fixture);
  };
  const choose = async (select: HTMLSelectElement, index: number) => {
    select.value = String(index);
    select.dispatchEvent(new Event('change'));
    await settle(fixture);
  };
  const go = async () => {
    forward()!.click();
    await settle(fixture);
  };
  const heading = () => root().querySelector('.ngx-formad-heading')?.textContent?.trim();

  // Angular reports dev-mode trouble (NG0956 re-created collections, NG01916 hidden fields
  // still bound, ...) through console.warn; a journey must produce none of it.
  let warnings: string[];

  beforeEach(async () => {
    warnings = [];
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    });
    fixture = TestBed.createComponent(CheckoutHost);
    await settle(fixture);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    expect(warnings).toEqual([]);
  });

  it('walks the account arm: cart, fork, account, shipping with a hidden field and a placed component, summary, result', async () => {
    // Cart: one item to start; add two, name them, drop the middle one; the last keeps its view.
    expect(heading()).toBe('Your cart');
    expect(inputByLabel('SKU').value).toBe('A');
    buttonByText('Add item')!.click();
    await settle(fixture);
    buttonByText('Add item')!.click();
    await settle(fixture);
    const skus = () => all<HTMLInputElement>('input[type="text"]');
    expect(skus().length).toBe(3);
    await type(skus()[1], 'B');
    await type(skus()[2], 'C');
    const third = skus()[2];
    all<HTMLButtonElement>('.ngx-formad-array-remove')[1].click();
    await settle(fixture);
    expect(skus().map((i) => i.value)).toEqual(['A', 'C']);
    expect(skus()[1]).toBe(third);
    await go();

    // Fork on how to buy: the radio is drawn by the select control, options by index.
    expect(heading()).toBe('How to buy');
    await choose(root().querySelector('select')!, 0);
    await go();

    // The account arm.
    expect(heading()).toBe('Create an account');
    await type(inputByLabel('Email'), 'ada@example.com');
    await type(inputByLabel('Password'), 'hunter2');
    await go();

    // Shipping: Next is refused with the blocker named while the street is empty.
    expect(heading()).toBe('Shipping');
    expect(root().querySelector('.confirm-note')?.textContent).toBe('We will e-mail the confirmation.');
    expect(inputByLabel('Locker code')).toBeUndefined();
    await go();
    expect(heading()).toBe('Shipping');
    expect(forward()!.getAttribute('aria-disabled')).toBe('true');
    expect(root().querySelector('.ngx-formad-blockers')?.textContent).toContain('Street');

    await type(inputByLabel('Street'), 'Długa 1');
    await type(inputByLabel('City'), 'Kraków');
    await choose(root().querySelector('select')!, 1); // Parcel locker
    expect(inputByLabel('Locker code')).toBeDefined();
    await type(inputByLabel('Locker code'), 'KRA-042');
    all<HTMLButtonElement>('.window')[1].click(); // 12-15, through the placed component
    await settle(fixture);
    expect(all<HTMLButtonElement>('.window.chosen').map((b) => b.textContent?.trim())).toEqual(['12-15']);
    const newsletter = inputByLabel('Send me the newsletter');
    newsletter.checked = true;
    newsletter.dispatchEvent(new Event('change'));
    await settle(fixture);

    // Back keeps what was typed on both sides of the move.
    buttonByText('Back')!.click();
    await settle(fixture);
    expect(heading()).toBe('Create an account');
    expect(inputByLabel('Email').value).toBe('ada@example.com');
    await go();
    expect(heading()).toBe('Shipping');
    expect(inputByLabel('Locker code').value).toBe('KRA-042');
    expect(all<HTMLButtonElement>('.window.chosen').map((b) => b.textContent?.trim())).toEqual(['12-15']);
    await go();

    // Summary is built on entry from the live context.
    expect(heading()).toBe('Summary');
    expect(root().querySelector('.summary')?.textContent).toBe('Confirmation goes to ada@example.com');
    expect(forward()!.textContent?.trim()).toBe('Finish');
    await go();

    // Egress: the arm's typed result, and every named step's models as committed.
    expect(fixture.componentInstance.done).toEqual({ mode: 'account', email: 'ada@example.com' });
    const last = fixture.componentInstance.commits.at(-1) as Commit;
    // Signal forms keys array items with a symbol of its own; compare the fields.
    const items = last['cart']['cart']['items'] as readonly CartItem[];
    expect(items.map(({ sku, qty }) => ({ sku, qty }))).toEqual([
      { sku: 'A', qty: 1 },
      { sku: 'C', qty: null },
    ]);
    expect(last['accountShipping']['shipping']).toEqual({
      address: { street: 'Długa 1', city: 'Kraków' },
      method: 'locker',
      locker: 'KRA-042',
      window: '12-15',
      newsletter: true,
    });
  });

  it('walks the guest arm: contact details instead of an account, then shipping, then the guest result', async () => {
    await go(); // the cart as it stands
    await choose(root().querySelector('select')!, 1); // Buy as a guest
    await go();

    expect(heading()).toBe('Your details');
    await type(inputByLabel('Email'), 'guest@example.com');
    await type(inputByLabel('Phone'), '+48 600 000 000');
    await go();

    expect(heading()).toBe('Shipping');
    await type(inputByLabel('Street'), 'Krótka 2');
    expect(forward()!.textContent?.trim()).toBe('Finish');
    await go();

    expect(fixture.componentInstance.done).toEqual({ mode: 'guest', email: 'guest@example.com' });
    const last = fixture.componentInstance.commits.at(-1) as Commit;
    expect(last['guestShipping']['shipping']['method']).toBe('courier');
    expect(last['guestShipping']['shipping']['locker']).toBe('');
  });
});
