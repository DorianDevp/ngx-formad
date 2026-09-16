import { text, UiFormConfigBuilder } from 'formodel';
import { FormConfig } from '../../form';
import { CommittedOf, StepperBuilder } from './stepper-builder';

// What a gate's context promises is a TYPE, so only a type can guard it: an ungated predecessor is there, a
// gated one or a branch arm may have been skipped, and a template given at the page types its step like a pool
// entry would. These assertions fail to compile the day that changes.

type One = { v: string };
const oneForm = (label: string): FormConfig<One> => ({
  model: () => ({ v: '' }),
  ui: UiFormConfigBuilder.from({ v: '' }).v(text(label)),
});

type Address = { street: string };
const addressForm: FormConfig<Address> = {
  model: () => ({ street: '' }),
  ui: UiFormConfigBuilder.from({ street: '' }).street(text('Street')),
};

type ContextOf<B> = B extends StepperBuilder<infer _F, infer _K, infer C> ? C : never;
type MayBeAbsent<T> = undefined extends T ? true : false;
type Extends<A, B> = A extends B ? true : false;

const chain = new StepperBuilder()
  .withState({ plan: 'basic' as 'basic' | 'plus' })
  .createForm('cart', oneForm('Cart'))
  .createForm('gift', oneForm('Gift'))
  .createStep((s) => s.createPage((p) => p.addForm('cart'), { heading: 'Cart' }), { name: 'cart' })
  .createStep((s) => s.createPage((p) => p.addForm('gift'), { heading: 'Gift' }), {
    name: 'gift',
    activeWhen: ({ shared }) => shared.plan() === 'plus',
  })
  .branch((c) => c.shared.plan(), {
    basic: (b) => b.createStep((s) => s.createPage((p) => p.addForm('address', addressForm), { heading: 'Address' }), { name: 'home' }),
    plus: (b) => b.createStep((s) => s.createPage((p) => p.addForm('address', addressForm), { heading: 'Address' }), { name: 'work' }),
  });

type Steps = ContextOf<typeof chain>['steps'];

describe('What a gate’s context promises', () => {
  it('has an ungated predecessor there, and a gated one or an arm possibly absent', () => {
    const cart: MayBeAbsent<Steps['cart']> = false;
    const gift: MayBeAbsent<Steps['gift']> = true;
    const home: MayBeAbsent<Steps['home']> = true;

    expect([cart, gift, home]).toEqual([false, true, true]);
  });

  it('types a template given at the page by that template, under the name it was placed as', () => {
    const street: Extends<NonNullable<Steps['home']>['address']['model'], () => Address> = true;

    expect(street).toBe(true);
  });

  it('carries a page’s own template into the committed record', () => {
    type Committed = CommittedOf<ReturnType<typeof chain.build>>;
    const home: Extends<NonNullable<Committed['home']>['address'], Address> = true;
    const cart: Extends<NonNullable<Committed['cart']>['cart'], One> = true;

    expect([home, cart]).toEqual([true, true]);
  });
});
