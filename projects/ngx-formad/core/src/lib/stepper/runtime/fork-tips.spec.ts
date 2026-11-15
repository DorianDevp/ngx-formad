import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { text, UiFormConfigBuilder } from 'formodel';
import { FormConfig, FormState } from '../../form';
import { StepperBuilder } from '../builder/stepper-builder';
import { StepperComponent } from '../ui/stepper.component';

type One = { v: string };
const form = (label: string): FormConfig<One> => ({
  model: () => ({ v: '' }),
  ui: UiFormConfigBuilder.from({ v: '' }).v(text(label)),
});

type Eq<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Has<T, K extends PropertyKey> = T extends unknown ? (K extends keyof T ? true : false) : never;
type Assert<T extends true> = T;

// A shop checkout: a delivery choice, then either a pickup point or a courier address; the courier arm forks again
// into a home or an office delivery, and only an office delivery may add a floor (gated). The tips are `pickup`, `home`
// and `office`; `courier` is a head, not a tip.
const checkout = () =>
  new StepperBuilder()
    .withState({ delivery: '' as '' | 'pickup' | 'courier', place: '' as '' | 'home' | 'office', withFloor: false })
    .createForm('cart', form('Cart'))
    .createStep((s) => s.createPage((p) => p.addForm('cart'), { heading: 'Cart' }), { name: 'cart' })
    .fork((c) => c.shared.delivery(), {
      pickup: (arm) =>
        arm
          .createForm('point', form('Point'))
          .createStep((s) => s.createPage((p) => p.addForm('point'), { heading: 'Point' }), { name: 'point' }),
      courier: (arm) =>
        arm
          .createForm('address', form('Address'))
          .createStep((s) => s.createPage((p) => p.addForm('address'), { heading: 'Address' }), { name: 'address' })
          .fork((c) => c.shared.place(), {
            home: (inner) =>
              inner
                .createForm('bell', form('Bell'))
                .createStep((s) => s.createPage((p) => p.addForm('bell'), { heading: 'Bell' }), { name: 'bell' }),
            office: (inner) =>
              inner
                .createForm('floor', form('Floor'))
                .createForm('desk', form('Desk'))
                .createStep((s) => s.createPage((p) => p.addForm('floor'), { heading: 'Floor' }), {
                  name: 'floor',
                  activeWhen: (c) => c.shared.withFloor(),
                })
                .createStep((s) => s.createPage((p) => p.addForm('desk'), { heading: 'Desk' }), { name: 'desk' }),
          }),
    });

describe('fork tips: types', () => {
  it('types each tip context exactly: walked steps present, skipped ones absent, never `undefined`', () => {
    const built = () =>
      checkout().build({
        pickup: (ctx) => {
          type Steps = typeof ctx.steps;
          type _cart = Assert<Eq<Steps['cart'], { readonly cart: FormState<One> }>>;
          type _point = Assert<Eq<Steps['point'], { readonly point: FormState<One> }>>;
          type _noCourier = Assert<Eq<Has<Steps, 'address'>, false>>;
          return { kind: 'pickup' as const, point: ctx.steps.point.point.model().v };
        },
        home: (ctx) => ({ kind: 'home' as const, street: ctx.steps.address.address.model().v, bell: ctx.steps.bell.bell.model().v }),
        office: (ctx) => {
          type Steps = typeof ctx.steps;
          type _desk = Assert<Eq<Steps['desk'], { readonly desk: FormState<One> }>>;
          type _floorSplits = Assert<Eq<Has<Steps, 'floor'>, boolean>>;
          const floor = 'floor' in ctx.steps ? ctx.steps.floor.floor.model().v : null;
          type _floorNarrowed = Assert<Eq<typeof floor, string | null>>;
          return { kind: 'office' as const, desk: ctx.steps.desk.desk.model().v, floor };
        },
      });

    type Result = NonNullable<ReturnType<ReturnType<typeof built>['result']>>;
    type _keys = Assert<Eq<keyof Result, 'pickup' | 'home' | 'office'>>;
    type _office = Assert<Eq<Result['office'], { kind: 'office'; desk: string; floor: string | null } | undefined>>;
    expect(built).toBeDefined();
  });

  it('refuses a missing tip, a head named as a tip and a stranger', () => {
    const refused = () => {
      // @ts-expect-error - `office` has no mapper
      checkout().build({ pickup: () => 1, home: () => 2 });
      checkout().build({
        pickup: () => 1,
        home: () => 2,
        office: () => 3,
        // @ts-expect-error - `courier` is a head, not a tip
        courier: () => 4,
      });
    };
    expect(refused).toBeDefined();
  });

  it('keeps the plain build() as it was', () => {
    const plain = () => checkout().build();
    type Result = NonNullable<ReturnType<ReturnType<typeof plain>['result']>>;
    type _arms = Assert<Eq<Has<Result, 'pickup'> | Has<Result, 'courier'>, boolean>>;
    expect(plain).toBeDefined();
  });
});

describe('fork tips: authoring errors', () => {
  it('refuses a tip name two arms end in, across nested forks', () => {
    expect(() =>
      new StepperBuilder().withState({ a: '', b: '' }).fork((c) => c.shared.a(), {
        left: (arm) => arm.createStep((s) => s.createPage((p) => p), { name: 'l' }),
        right: (arm) =>
          arm.fork((c) => c.shared.b(), {
            left: (inner) => inner.createStep((s) => s.createPage((p) => p), { name: 'rl' }),
            other: (inner) => inner.createStep((s) => s.createPage((p) => p), { name: 'ro' }),
          }),
      }),
    ).toThrow(/the tip 'left' ends two arms/);
  });
});

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" (completed)="done = $event" />`,
})
class TipsHost {
  done: unknown = undefined;
  seen: string[] = [];
  readonly stepper = checkout().build({
    pickup: (ctx) => ({ point: ctx.steps.point.point.model().v }),
    home: (ctx) => ({ bell: ctx.steps.bell.bell.model().v }),
    office: (ctx) => {
      this.seen = Object.keys(ctx.steps);
      return { desk: ctx.steps.desk.desk.model().v, floor: 'floor' in ctx.steps ? ctx.steps.floor.floor.model().v : null };
    },
  });
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

async function type(fixture: ComponentFixture<unknown>, value: string): Promise<void> {
  const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await fixture.whenStable();
}

async function forward(fixture: ComponentFixture<unknown>): Promise<void> {
  const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
  buttons[buttons.length - 1].click();
  await settle(fixture);
}

describe('fork tips: runtime', () => {
  it('hands out what the reached tip maps to, under its name alone, as result() and on Finish', async () => {
    const fixture = TestBed.createComponent(TipsHost);
    const host = fixture.componentInstance;
    host.stepper.instance.sharedState['delivery'].set('pickup');
    await settle(fixture);
    expect(host.stepper.result()).toBeNull();

    await type(fixture, 'basket');
    await forward(fixture);
    await type(fixture, 'kiosk 7');
    expect(host.stepper.result()).toEqual({ pickup: { point: 'kiosk 7' } });

    await forward(fixture);
    expect(host.done).toEqual({ pickup: { point: 'kiosk 7' } });
  });

  it('reaches a tip of a nested fork, with a skipped gated step absent from the walked steps', async () => {
    const fixture = TestBed.createComponent(TipsHost);
    const host = fixture.componentInstance;
    host.stepper.instance.sharedState['delivery'].set('courier');
    host.stepper.instance.sharedState['place'].set('office');
    await settle(fixture);

    await type(fixture, 'basket');
    await forward(fixture);
    await type(fixture, 'Main St 1');
    await forward(fixture);
    await type(fixture, 'desk 12');
    await forward(fixture);

    expect(host.done).toEqual({ office: { desk: 'desk 12', floor: null } });
    expect(host.seen).toEqual(['cart', 'address', 'desk']);
  });

  it('refuses a missing or a stranger mapper at build', () => {
    TestBed.runInInjectionContext(() => {
      const mappers = { pickup: () => 1, home: () => 2 } as never;
      expect(() => checkout().build(mappers)).toThrow(/no mapper for: office/);
      const strangers = { pickup: () => 1, home: () => 2, office: () => 3, courier: () => 4 } as never;
      expect(() => checkout().build(strangers)).toThrow(/courier is no tip of the fork/);
    });
  });
});
