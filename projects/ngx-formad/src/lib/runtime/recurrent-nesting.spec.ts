import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiFormConfigBuilder, text } from 'formodel';
import {
  asRecurrentStepper,
  asStepper,
  RecurrentStepperBuilder,
  RuntimeStepper,
  StepperBuilder,
} from '../builders/stepper-builder';
import { RuntimeFlow } from '../builders/flow';
import { FormConfig } from '../form-config/form-config';
import { provideFormadSuite } from '../provide';
import { FormadDockRestart } from './flow-dock';
import { StepPageView } from './step-page-view';
import { StepperController } from './stepper-controller';
import { StepperComponent } from './stepper.component';

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

// ── A recurrent stepper AS THE ROOT: the same shell, the same chrome. ──

function rootRing(): RuntimeFlow {
  const loop = new RecurrentStepperBuilder<{}, {}, Item[]>(() => []);
  const view = loop.view;

  return asRecurrentStepper(
    loop
      .withState({ draft: '' })
      .createForm('name', oneForm('Name'))
      .createStep(
        (s) =>
          s.createPage({ options: { heading: 'Name' } }, (p) =>
            p.addForm(
              (f) => f.name,
              { bind: (l) => l.link((m) => m.v, (sh) => sh.draft) },
            ),
          ),
        { label: 'Name' },
      )
      .fold((collected, pass) => [...collected, { name: pass.shared.draft }])
      .completeWhen((items) => items.length > 0, 'Add at least one')
      .dock(
        (s) =>
          s.createPage({ options: { heading: 'Collected' } }, (p) =>
            p.addComponent(NestDock, { inputs: { items: () => view.all() } }),
          ),
        { label: 'Dock' },
      )
      .build(),
  );
}

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" (completed)="result = $event" />`,
})
class RootRingHost {
  result: unknown = null;

  readonly stepper = rootRing();
}

// ── A linear stepper as a PASS STEP of a ring — the symmetric direction. ──

function ringWithLinearPass(): RuntimeStepper {
  return asStepper(
    new StepperBuilder()
      .withState({})
      .createRecurrentStepper(
        'items',
        { collection: (): Item[] => [], label: 'Items' },
        (loop, view) =>
          loop
            .createStepper('unit', { label: 'Unit' }, (sub) =>
              sub
                .createForm('a', oneForm('A'))
                .createForm('b', oneForm('B'))
                .createStep(
                  (s) => s.createPage({ options: { heading: 'A' } }, (p) => p.addForm((f) => f.a)),
                  { label: 'A' },
                )
                .createStep(
                  (s) => s.createPage({ options: { heading: 'B' } }, (p) => p.addForm((f) => f.b)),
                  { label: 'B' },
                ),
            )
            .fold((collected, pass) => {
              const unit = pass.value('unit');
              return [...collected, { name: unit?.a?.v ?? '' }];
            })
            .completeWhen((items) => items.length > 0)
            .dock(
              (s) =>
                s.createPage({ options: { heading: 'Collected' } }, (p) =>
                  p.addComponent(NestDock, { inputs: { items: () => view.all() } }),
                ),
              { label: 'Dock' },
            ),
      )
      .build(),
  );
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

  it('runs the ring at the root and completes with the collection as the result', async () => {
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
