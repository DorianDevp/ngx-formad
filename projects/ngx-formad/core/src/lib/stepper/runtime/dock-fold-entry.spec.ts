import { Component, input, inputBinding, output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiFormConfigBuilder, text } from 'formodel';
import { defaultControls } from 'ngx-formad/template';
import { FormConfig } from '../../form';
import { provideFormadSuite } from '../../provide';
import { StepperBuilder } from '../builder/stepper-builder';
import { FoldEntry, StepPages } from '../types/builder';
import { StepperController } from '../types/controller';
import { PassStep } from '../types/step-context';
import { StepPageView } from '../ui/step-page-view';
import { StepperComponent } from '../ui/stepper.component';
import { FormadDockRestart } from './flow-dock';

// A dock lists what the ring collected; its component emits an entry, and the dock's listener receives it as a
// FoldEntry: that path's values, and what can be done with the entry - remove it, or reopen a pass for it on one of its
// path's steps, Back reaching no further than `maxBackwardStep`, the fold's result then taking the entry's place.

type One = { v: string };
const oneForm = (start = ''): FormConfig<One> => ({
  model: () => ({ v: start }),
  ui: UiFormConfigBuilder.from({ v: '' }).v(text('V')),
});

type Item = { readonly label: string };

@Component({
  selector: 'items-dock',
  imports: [FormadDockRestart],
  template: `
    @for (item of items(); track $index) {
      <p class="item">
        <span class="label">{{ item.label }}</span>
        <button type="button" class="edit" (click)="edit.emit(item)">Edit</button>
        <button type="button" class="remove" (click)="remove.emit(item)">Remove</button>
      </p>
    }
    <button type="button" class="another" ngxFormadDockRestart>Add another</button>
  `,
})
class ItemsDock {
  readonly items = input.required<readonly Item[]>();
  readonly edit = output<Item>();
  readonly remove = output<Item>();
}

@Component({
  selector: 'items-chrome',
  imports: [StepPageView],
  template: `
    @let c = controller();
    <span class="heading">{{ c.label() }}</span>
    <span class="cancels">{{ c.backCancels() }}</span>
    @if (c.step(); as step) {
      <ngx-formad-step-page [step]="step" />
    }
    <button type="button" class="back" (click)="c.back()">Back</button>
    <button type="button" class="next" (click)="c.next()">Next</button>
  `,
})
class ItemsChrome {
  readonly controller = input.required<StepperController>();
}

/** Where the edit listener reopens a pass that went through `serial`: on it, or on `details` with Back down to it. */
let reopenOn: 'serial' | 'details' = 'serial';

const items = () =>
  new StepperBuilder().createRecurrentStepper('items', {
    state: (): Item[] => [],
    build: (loop) =>
      loop
        .createStep((s) => s.createPage((p) => p.addForm('kind', oneForm())), { name: 'kind', label: 'Kind' })
        .branch((ctx) => (ctx.steps.kind.kind.model().v === 'b' ? 'b' : 'a'), {
          a: (arm) => arm.createStep((s) => s.createPage((p) => p.addForm('name', oneForm())), { name: 'name', label: 'Name' }),
          b: (arm) =>
            arm
              .createStep((s) => s.createPage((p) => p.addForm('serial', oneForm())), { name: 'serial', label: 'Serial' })
              .createStep((s) => s.createPage((p) => p.addForm('details', oneForm())), { name: 'details', label: 'Details' }),
        })
        .fold((state, ctx) => [
          ...state,
          {
            label: ctx.steps.name
              ? ctx.steps.name.name.model().v
              : `${ctx.steps.serial?.serial.model().v}/${ctx.steps.details?.details.model().v}`,
          },
        ])
        .dock(
          (s, ctx) =>
            s.createPage((p) => p.addComponent(ItemsDock, { bindings: [inputBinding('items', () => ctx.flow.state())] })),
          { label: 'Dock', pages: StepPages.OnEntry },
          {
            edit: (entry) => {
              if ('serial' in entry) {
                if (reopenOn === 'details') entry.reopen('details', { maxBackwardStep: 'serial' });
                else entry.reopen('serial');
              } else if ('name' in entry) {
                entry.reopen('name');
              }
            },
            remove: (entry) => entry.remove(),
          },
        ),
  });

type KindStep = PassStep<'kind', { readonly kind: One }>;
type ByName = readonly [KindStep, PassStep<'name', { readonly name: One }>];
type BySerial = readonly [KindStep, PassStep<'serial', { readonly serial: One }>, PassStep<'details', { readonly details: One }>];

describe('A FoldEntry, as typed', () => {
  it('narrows to the paths through a step, carries their values and offers only their steps to reopen', () => {
    const read = (entry: FoldEntry<Item, ByName | BySerial>): string => {
      if ('serial' in entry) {
        entry.reopen('details', { maxBackwardStep: 'serial' });
        // @ts-expect-error a path through serial has no step named 'name'
        entry.reopen('name');

        return `${entry.serial.serial.v}/${entry.details.details.v}`;
      }

      return entry.name.name.v;
    };

    expect(typeof read).toBe('function');
  });
});

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class ItemsHost {
  readonly stepper = items().build();
}

describe('A dock listener', () => {
  let fixture: ComponentFixture<ItemsHost>;

  const all = (selector: string): HTMLElement[] => [...fixture.nativeElement.querySelectorAll(selector)] as HTMLElement[];
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  };
  const click = async (selector: string, at = 0): Promise<void> => {
    all(selector)[at].click();
    await settle();
  };
  const field = (): HTMLInputElement => all('input')[0] as HTMLInputElement;
  const type = async (value: string): Promise<void> => {
    field().value = value;
    field().dispatchEvent(new Event('input'));
    await settle();
  };
  const heading = (): string => all('.heading')[0].textContent ?? '';
  const cancels = (): string => all('.cancels')[0].textContent ?? '';
  const labels = (): string[] => all('.item .label').map((label) => label.textContent ?? '');

  /** One pass: the kind, then each value on its own step. */
  const pass = async (kind: 'a' | 'b', ...values: string[]): Promise<void> => {
    await type(kind);
    await click('.next');
    for (const value of values) {
      await type(value);
      await click('.next');
    }
  };

  beforeEach(async () => {
    reopenOn = 'serial';
    TestBed.configureTestingModule({ providers: [provideFormadSuite({ controls: defaultControls, stepper: ItemsChrome })] });
    fixture = TestBed.createComponent(ItemsHost);
    await settle();
    await pass('a', 'Ada');
    await click('.another');
    await pass('b', 'S1', 'D1');
  });

  it('lists what the passes folded', () => {
    expect(heading()).toBe('Dock');
    expect(labels()).toEqual(['Ada', 'S1/D1']);
  });

  it('reopens a pass on the step the listener names, its values back in the form, Back cancelling there', async () => {
    await click('.edit', 0);

    expect(heading()).toBe('Name');
    expect(field().value).toBe('Ada');
    expect(cancels()).toBe('true');
  });

  it('leaves the entry as it was when the reopened pass is cancelled', async () => {
    await click('.edit', 0);
    await type('Changed');
    await click('.back');

    expect(heading()).toBe('Dock');
    expect(labels()).toEqual(['Ada', 'S1/D1']);
  });

  it('puts what the fold adds in the reopened entry’s place', async () => {
    await click('.edit', 0);
    await type('Grace');
    await click('.next');

    expect(heading()).toBe('Dock');
    expect(labels()).toEqual(['Grace', 'S1/D1']);
  });

  it('walks the rest of the entry’s path, every step with its own values back', async () => {
    await click('.edit', 1);
    expect(heading()).toBe('Serial');
    expect(field().value).toBe('S1');

    await click('.next');
    expect(heading()).toBe('Details');
    expect(field().value).toBe('D1');

    await type('D2');
    await click('.next');
    expect(labels()).toEqual(['Ada', 'S1/D2']);
  });

  it('lets Back reach maxBackwardStep and no further', async () => {
    reopenOn = 'details';
    await click('.edit', 1);
    expect(heading()).toBe('Details');
    expect(cancels()).toBe('false');

    await click('.back');
    expect(heading()).toBe('Serial');
    expect(cancels()).toBe('true');
  });

  it('removes an entry', async () => {
    await click('.remove', 0);

    expect(labels()).toEqual(['S1/D1']);
  });
});
