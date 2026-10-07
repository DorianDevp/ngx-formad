import { Component, inject, input, model, Signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormValueControl } from '@angular/forms/signals';
import { customField, text, UiFormConfigBuilder } from 'formodel';
import { defaultControls } from 'ngx-formad/template';
import { defineForm, FormConfig, formLayout, FormState } from '../../form';
import { provideFormadSuite } from '../../provide';
import { StepperBuilder } from '../builder/stepper-builder';
import { StepPages } from '../types/builder';
import { StepRevisit } from '../types/nodes';
import { StepperController } from '../types/controller';
import { StepPageView } from '../ui/step-page-view';
import { StepperComponent } from '../ui/stepper.component';
import { FormadWizard } from './wizard-context';

// The built stepper is the one typed object a host talks to: its shared store as read-only signals, and every named
// step's forms - an eager one as the instance itself, a lazy one (or any form of a step built on entry) as a signal
// that holds the instance once it exists.

type One = { v: string };
const oneForm = (start = ''): FormConfig<One> => ({
  model: () => ({ v: start }),
  ui: UiFormConfigBuilder.from({ v: '' }).v(text('V')),
});

type Eq<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

async function settle(fixture: ComponentFixture<object>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

const flow = () =>
  new StepperBuilder()
    .withState({ plan: 'basic' as 'basic' | 'plus', city: '' })
    .createForm('cart', oneForm('one'))
    .createForm('late', () => Promise.resolve(oneForm('late')))
    .createStep((s) => s.createPage((p) => p.addForm('cart'), { heading: 'Cart' }), { name: 'cart' })
    .createStep((s) => s.createPage((p) => p.addForm('late'), { heading: 'Late' }), { name: 'later' })
    .createStep((s) => s.createPage((p) => p.addForm('extra', oneForm('x')), { heading: 'Extra' }), {
      name: 'extra',
      activeWhen: ({ shared }) => shared.plan() === 'plus',
    })
    .createStep((s, ctx) => s.createPage((p) => p.addForm('note', oneForm(ctx.shared.city())), { heading: 'Note' }), {
      name: 'note',
      pages: StepPages.OnEntry,
    });

type Built = ReturnType<ReturnType<typeof flow>['build']>;

describe('The built stepper, as typed', () => {
  it('reads the shared store as one read-only signal per withState key', () => {
    const plan: Eq<Built['shared']['plan'], Signal<'basic' | 'plus'>> = true;
    type Writable = Built['shared']['plan'] extends { set: unknown } ? true : false;
    const writable: Writable = false;

    expect([plan, writable]).toEqual([true, false]);
  });

  it('hands an eager form out as its instance, gated steps included', () => {
    const cart: Eq<Built['steps']['cart']['forms']['cart'], FormState<One>> = true;
    const extra: Eq<Built['steps']['extra']['forms']['extra'], FormState<One>> = true;

    expect([cart, extra]).toEqual([true, true]);
  });

  it('hands a lazy form, and every form of a step built on entry, out as a nullable signal', () => {
    const late: Eq<Built['steps']['later']['forms']['late'], Signal<FormState<One> | null>> = true;
    const note: Eq<Built['steps']['note']['forms']['note'], Signal<FormState<One> | null>> = true;

    expect([late, note]).toEqual([true, true]);
  });
});

describe('The built stepper, at runtime', () => {
  it('refuses to build outside an injection context', () => {
    expect(() => flow().build()).toThrow();
  });

  it('has its eager forms built the moment it is built, gated ones too', () => {
    const built = TestBed.runInInjectionContext(() => flow().build());

    expect(built.steps.cart.forms.cart.model()).toEqual({ v: 'one' });
    expect(built.steps.extra.forms.extra.model()).toEqual({ v: 'x' });
    expect(built.steps.later.forms.late()).toBeNull();
    expect(built.steps.note.forms.note()).toBeNull();
    expect(built.shared.plan()).toBe('basic');
  });
});

// A formField of a step form reads the wizard from DI: the stepper's own environment holds it.
@Component({ selector: 'wiz-field', template: `<span class="wiz-field">{{ found }}</span>` })
class WizField implements FormValueControl<string> {
  readonly value = model('');
  readonly found = inject(FormadWizard, { optional: true }) ? 'wizard' : 'none';
}

type Picked = { pick: string };
const pickedForm = defineForm({
  model: (): Picked => ({ pick: '' }),
  ui: { pick: customField() },
  layout: formLayout<Picked>().control('pick', { component: WizField }).build(),
});

@Component({
  selector: 'inst-chrome',
  imports: [StepPageView],
  template: `
    @let c = controller();
    @if (c.step(); as step) {
      <ngx-formad-step-page [step]="step" />
    }
    <button type="button" class="back" (click)="c.back()">Back</button>
    <button type="button" class="next" (click)="c.next()">Next</button>
  `,
})
class InstChrome {
  readonly controller = input.required<StepperController>();
}

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class InstHost {
  readonly stepper = new StepperBuilder()
    .withState({ city: 'Oslo' })
    .createForm('picked', pickedForm)
    .createForm('first', oneForm('start'))
    .createForm('late', () => Promise.resolve(oneForm('late')))
    .createStep((s) => s.createPage((p) => p.addForm('picked').addForm('first'), { heading: '1' }), {
      name: 'one',
      revisit: StepRevisit.Fresh,
    })
    .createStep((s) => s.createPage((p) => p.addForm('late'), { heading: '2' }), { name: 'two' })
    .build();
}

describe('The built stepper, rendered', () => {
  let fixture: ComponentFixture<InstHost>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideFormadSuite({ controls: defaultControls, stepper: InstChrome })] });
    fixture = TestBed.createComponent(InstHost);
    await settle(fixture);
  });

  const click = async (selector: string): Promise<void> => {
    (fixture.nativeElement.querySelector(selector) as HTMLButtonElement).click();
    await settle(fixture);
  };

  it('lets a custom control inside a step form inject the wizard', () => {
    expect(fixture.nativeElement.querySelector('.wiz-field')?.textContent).toBe('wizard');
  });

  it('draws the very instance the stepper hands out', async () => {
    const first = fixture.componentInstance.stepper.steps.one.forms.first;
    first.model.set({ v: 'typed' });
    await settle(fixture);

    const inputs = fixture.nativeElement.querySelectorAll('input') as NodeListOf<HTMLInputElement>;
    expect([...inputs].some((el) => el.value === 'typed')).toBe(true);
  });

  it('fills a lazy form’s signal once its step is entered', async () => {
    const late = fixture.componentInstance.stepper.steps.two.forms.late;
    expect(late()).toBeNull();

    await click('.next');

    expect(late()?.model()).toEqual({ v: 'late' });
  });

  it('starts a fresh revisit over in the same instance', async () => {
    const first = fixture.componentInstance.stepper.steps.one.forms.first;
    first.model.set({ v: 'typed' });
    await click('.next');
    await click('.back');

    expect(fixture.componentInstance.stepper.steps.one.forms.first).toBe(first);
    expect(first.model()).toEqual({ v: 'start' });
  });
});
