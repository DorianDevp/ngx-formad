import { Component, input, inputBinding } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiFormConfigBuilder, text } from 'formodel';
import { FormConfig } from '../../form';
import { provideFormadSuite } from '../../provide';
import { link } from '../builder/shared-link';
import { RecurrentStepperBuilder } from '../builder/recurrent-stepper-builder';
import { StepperBuilder } from '../builder/stepper-builder';
import { RuntimeStepper } from '../types/flow';
import { StepPages } from '../types/builder';
import { StepperController } from '../types/controller';
import { StepPageView } from '../ui/step-page-view';
import { StepperComponent } from '../ui/stepper.component';
import { FormadDockRestart } from './flow-dock';

async function settle(fixture: ComponentFixture<object>): Promise<void> {
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

type Item = { name: string };

@Component({
  selector: 'nest-dock',
  imports: [FormadDockRestart],
  template: `
    <span class="count">{{ items().length }}</span>
    <button type="button" class="add" ngxFormadDockRestart>Add another</button>
  `,
})
class NestDock {
  readonly items = input.required<Item[]>();
}

@Component({
  selector: 'nest-chrome',
  imports: [StepPageView],
  template: `
    @let c = controller();
    @if (c.step(); as step) {
      <ngx-formad-step-page [step]="step" />
    }
    <span class="heading">{{ c.heading() }}</span>
    <span class="levels">{{ c.progress().levels.length }}</span>
    <button type="button" class="next" (click)="c.next()">Next</button>
    <button type="button" class="back" (click)="c.back()">Back</button>
  `,
})
class NestChrome {
  readonly controller = input.required<StepperController>();
}

function rootRing(): RuntimeStepper {
  return new RecurrentStepperBuilder<{}, Item[]>({ state: () => [] })
      .withState({ draft: '' })
      .createForm('name', oneForm('Name'))
      .createStep(
        (s) =>
          s.createPage((p) =>
            p.addForm('name', { fieldValueBindings: (f, s) => [link(f.v, s.draft)] }), { heading: 'Name' },
          ),
        { label: 'Name' },
      )
      .fold((state, pass) => [...state, { name: pass.shared.draft() }])
      // A static dock: the bindings callback reads the ring's state, so nothing about the
      // page's STRUCTURE depends on the context and the step need not be dynamic. Its
      // completeWhen is the flow's own contract - there is no other way out of the ring.
      .dock(
        (s) =>
          s.createPage((p) =>
            p.addComponent(NestDock, { bindings: (ctx) => [inputBinding('items', () => ctx.flow.state())] }), { heading: 'Collected' },
          ),
        {
          label: 'Dock',
          completeWhen: (ctx) => ctx.flow.state().length > 0,
          incompleteMessage: 'Add at least one',
        },
      )
      .build();
}

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" (completed)="result = $event" />`,
})
class RootRingHost {
  result: unknown = null;

  readonly stepper = rootRing();
}

function ringWithLinearPass(): RuntimeStepper {
  return new StepperBuilder()
      .withState({})
      .createRecurrentStepper('items', {
        state: (): Item[] => [],
        label: 'Items',
        build: (loop) =>
          loop
            .createStepper('unit', {
              label: 'Unit',
              build: (sub) =>
                sub
                  .createForm('a', oneForm('A'))
                  .createForm('b', oneForm('B'))
                  .createStep(
                    (s) => s.createPage((p) => p.addForm('a'), { heading: 'A' }),
                    { name: 'a', label: 'A' },
                  )
                  .createStep(
                    (s) => s.createPage((p) => p.addForm('b'), { heading: 'B' }),
                    { name: 'b', label: 'B' },
                  ),
            })
            .fold((state, pass) => [...state, { name: pass.steps.unit?.a?.a.v ?? '' }])
            .dock(
              (s, ctx) =>
                s.createPage((p) =>
                  p.addComponent(NestDock, { bindings: [inputBinding('items', () => ctx.flow.state())] }), { heading: 'Collected' },
                ),
              { label: 'Dock', pages: StepPages.OnEntry, completeWhen: (ctx) => ctx.flow.state().length > 0 },
            ),
      })
      .build();
}

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class LinearPassHost {
  readonly stepper = ringWithLinearPass();
}

describe('Recurrent stepper as the root flow', () => {
  let fixture: ComponentFixture<RootRingHost>;

  const heading = () =>
    (fixture.nativeElement.querySelector('.heading') as HTMLElement).textContent.trim();
  const click = async (selector: string) => {
    (fixture.nativeElement.querySelector(selector) as HTMLButtonElement).click();
    await settle(fixture);
  };
  const type = async (value: string) => {
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideFormadSuite({ stepper: NestChrome })] });
    fixture = TestBed.createComponent(RootRingHost);
    await settle(fixture);
  });

  it('runs the ring at the root and completes with the state as the result', async () => {
    expect(heading()).toBe('Name');

    await type('alpha');
    await click('.next');
    expect(heading()).toBe('Collected');

    await click('.add');
    await type('beta');
    await click('.next');
    await click('.next');

    expect(fixture.componentInstance.result).toEqual([{ name: 'alpha' }, { name: 'beta' }]);
  });
});

describe('A linear stepper as a pass step of a ring', () => {
  let fixture: ComponentFixture<LinearPassHost>;

  const read = (selector: string) =>
    (fixture.nativeElement.querySelector(selector) as HTMLElement).textContent.trim();
  const click = async (selector: string) => {
    (fixture.nativeElement.querySelector(selector) as HTMLButtonElement).click();
    await settle(fixture);
  };
  const type = async (value: string) => {
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideFormadSuite({ stepper: NestChrome })] });
    fixture = TestBed.createComponent(LinearPassHost);
    await settle(fixture);
  });

  it('walks the linear sub-flow inside the pass, three levels deep', async () => {
    expect(read('.heading')).toBe('A');
    expect(read('.levels')).toBe('3');

    await type('first');
    await click('.next');
    expect(read('.heading')).toBe('B');

    await click('.next');
    expect(read('.heading')).toBe('Collected');
    expect(read('.count')).toBe('1');
    expect(read('.levels')).toBe('2');
  });

  it('folds the sub-flow committed record, and Back walks out through the levels', async () => {
    await type('first');
    await click('.next');
    await click('.back');
    expect(read('.heading')).toBe('A');

    await click('.next');
    await click('.next');
    await click('.add');
    await type('second');
    await click('.next');
    await click('.next');

    expect(read('.count')).toBe('2');
  });
});
