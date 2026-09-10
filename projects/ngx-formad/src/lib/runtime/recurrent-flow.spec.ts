import { Component, input, inputBinding } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiFormConfigBuilder, text } from 'formodel';
import { RuntimeStepper, StepPages, StepperBuilder } from '../builders/stepper-builder';
import { FormConfig } from '../form-config/form-config';
import { provideFormadSuite } from '../provide';
import { FormadDockRestart } from './flow-dock';
import { StepPageView } from './step-page-view';
import { StepperController } from './stepper-controller';
import { StepperComponent } from './stepper.component';
import { link } from '../builders/shared-link';

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
  selector: 'dock-panel',
  imports: [FormadDockRestart],
  template: `
    <span class="count">{{ items().length }}</span>
    <button type="button" class="add" ngxFormadDockRestart>Add another</button>
  `,
})
class DockPanel {
  readonly items = input.required<Item[]>();
}

@Component({
  selector: 'ring-chrome',
  imports: [StepPageView],
  template: `
    @let c = controller();
    @if (c.step(); as step) {
      <ngx-formad-step-page [step]="step" />
    }
    <span class="heading">{{ c.heading() }}</span>
    <span class="idx">{{ c.index() }}</span>
    <span class="total">{{ c.total() }}</span>
    <span class="last">{{ c.isLast() }}</span>
    <span class="levels">{{ c.progress().levels.length }}</span>
    <span class="canBack">{{ c.canBack() }}</span>
    <span class="blockers">
      @for (issue of c.blockers(); track $index) {
        {{ issue.message }}
      }
    </span>
    <button type="button" class="next" (click)="c.next()">Next</button>
    <button type="button" class="back" (click)="c.back()">Back</button>
  `,
})
class RingChrome {
  readonly controller = input.required<StepperController>();
}

function deviceStepper(): RuntimeStepper {
  return new StepperBuilder()
      .withState({ source: '' })
      .createForm('intro', oneForm('Source'))
      .createForm('final', oneForm('Final'))
      .createStep(
        (s) =>
          s.createPage((p) =>
            p.addForm('intro', { fieldValueBindings: (f, s) => [link(f.v, s.source)] }), { heading: 'Intro' },
          ),
        { label: 'Intro' },
      )
      .createRecurrentStepper('devices', {
        state: (): Item[] => [],
        label: 'Devices',
        build: (loop) =>
          loop
            .withState({ draftName: '' })
            .createForm('name', oneForm('Name'))
            .createForm('details', oneForm('Details'))
            .createForm('bulk', oneForm('Bulk'))
            .branch((c) => (c.shared.source() === 'invoice' ? 'invoice' : 'manual'), {
              manual: (b) =>
                b
                  .createStep(
                    (s) =>
                      s.createPage((p) =>
                        p.addForm('name', { fieldValueBindings: (f, s) => [link(f.v, s.draftName)] }), { heading: 'Name' },
                      ),
                    { name: 'name', label: 'Name' },
                  )
                  .createStep(
                    (s) =>
                      s.createPage((p) =>
                        p.addForm('details'), { heading: 'Details' },
                      ),
                    { name: 'details', label: 'Details' },
                  ),
              invoice: (b) =>
                b.createStep(
                  (s) =>
                    s.createPage((p) => p.addForm('bulk'), { heading: 'Bulk' }),
                  { name: 'bulk', label: 'Bulk' },
                ),
            })
            .fold((state, pass) => {
              const bulk = pass.steps.bulk?.bulk.model();
              if (bulk !== undefined) {
                if (bulk.v === 'none') return state;
                return [...state, { name: `${bulk.v}-1` }, { name: `${bulk.v}-2` }];
              }

              return [...state, { name: pass.shared.draftName() }];
            })
            .dock(
              (s, ctx) =>
                s.createPage((p) =>
                  p.addComponent(DockPanel, { bindings: [inputBinding('items', () => ctx.flow.state())] }), { heading: 'Collected' },
                ),
              {
                label: 'Dock',
                pages: StepPages.OnEntry,
                completeWhen: (ctx) => ctx.flow.state().length > 0,
                incompleteMessage: 'Add at least one device',
              },
            ),
      })
      .createStep(
        (s) => s.createPage((p) => p.addForm('final'), { heading: 'Final' }),
        { label: 'Final', activeWhen: (c) => (c.steps.devices?.length ?? 0) > 0 },
      )
      .build();
}

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper
    [stepper]="stepper"
    (completed)="completions = completions + 1"
    (stepCommitted)="last = $event"
  />`,
})
class RingHost {
  completions = 0;

  last: Record<string, unknown> | null = null;

  readonly stepper = deviceStepper();
}

describe('Recurrent flow - the ring around the dock', () => {
  let fixture: ComponentFixture<RingHost>;

  const read = (selector: string) =>
    (fixture.nativeElement.querySelector(selector) as HTMLElement).textContent.trim();
  const heading = () => read('.heading');
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
  const shown = () => (fixture.nativeElement.querySelector('input') as HTMLInputElement).value;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideFormadSuite({ stepper: RingChrome })] });
    fixture = TestBed.createComponent(RingHost);
    await settle(fixture);
  });

  const throughIntro = async (source = 'manual') => {
    await type(source);
    await click('.next');
  };

  const addManual = async (name: string) => {
    await type(name);
    await click('.next');
    await click('.next');
  };

  it('renders exactly one stepper and one chrome, on every stop of the ring', async () => {
    const counts = () => ({
      steppers: fixture.nativeElement.querySelectorAll('ngx-formad-stepper').length,
      chromes: fixture.nativeElement.querySelectorAll('ring-chrome').length,
    });

    expect(counts()).toEqual({ steppers: 1, chromes: 1 });
    await throughIntro();
    expect(heading()).toBe('Name');
    expect(counts()).toEqual({ steppers: 1, chromes: 1 });
    await addManual('alpha');
    expect(heading()).toBe('Collected');
    expect(counts()).toEqual({ steppers: 1, chromes: 1 });
  });

  it('enters the ring at the pass while nothing has folded', async () => {
    await throughIntro();

    expect(heading()).toBe('Name');
    expect(read('.idx')).toBe('1');
    expect(read('.levels')).toBe('2');
  });

  it('folds the finished pass and lands on the dock', async () => {
    await throughIntro();
    await addManual('alpha');

    expect(heading()).toBe('Collected');
    expect(read('.count')).toBe('1');
    expect(read('.idx')).toBe('1');
  });

  it('gates the wizard steps behind the ring on the live state', async () => {
    await throughIntro();
    expect(read('.total')).toBe('2');

    await addManual('alpha');
    expect(read('.total')).toBe('3');
  });

  it('opens a fresh pass from the dock intent, keeping the state', async () => {
    await throughIntro();
    await addManual('alpha');
    await click('.add');

    expect(heading()).toBe('Name');
    expect(shown()).toBe('');

    await addManual('beta');
    expect(read('.count')).toBe('2');
  });

  it('Next on the dock advances the instance above, with the state committed', async () => {
    await throughIntro();
    await addManual('alpha');
    await click('.next');

    expect(heading()).toBe('Final');
    expect(fixture.componentInstance.last?.['devices']).toEqual([{ name: 'alpha' }]);
  });

  it('never says Finish on a pass step, and completes only at the true end', async () => {
    await throughIntro();
    expect(read('.last')).toBe('false');

    await addManual('alpha');
    expect(read('.last')).toBe('false');

    await click('.next');
    expect(read('.last')).toBe('true');

    await click('.next');
    expect(fixture.componentInstance.completions).toBe(1);
  });

  it('Back inside a pass moves one pass step back', async () => {
    await throughIntro();
    await type('alpha');
    await click('.next');
    expect(heading()).toBe('Details');

    await click('.back');
    expect(heading()).toBe('Name');
    expect(shown()).toBe('alpha');
  });

  it('Back rejects the step it leaves: the revisit is factory-fresh, nothing committed', async () => {
    await throughIntro();
    await type('alpha');
    await click('.next');
    await type('scribbles');
    await click('.back');
    expect(heading()).toBe('Name');
    expect(shown()).toBe('alpha');

    await click('.next');
    expect(heading()).toBe('Details');
    expect(shown()).toBe('');
  });

  it('Back on the pass first step leaves the flow while nothing has folded', async () => {
    await throughIntro();
    await click('.back');

    expect(heading()).toBe('Intro');
  });

  it('Back on the pass first step abandons the draft to the dock once a pass folded', async () => {
    await throughIntro();
    await addManual('alpha');
    await click('.add');
    await type('abandoned');
    await click('.back');

    expect(heading()).toBe('Collected');
    expect(read('.count')).toBe('1');
  });

  it('Back on the dock leaves the flow to the previous step above', async () => {
    await throughIntro();
    await addManual('alpha');
    await click('.back');

    expect(heading()).toBe('Intro');
  });

  it('re-enters at the dock once a pass has folded', async () => {
    await throughIntro();
    await addManual('alpha');
    await click('.back');
    await click('.next');

    expect(heading()).toBe('Collected');
    expect(read('.count')).toBe('1');
  });

  it('a many-item pass folds many; an empty fold leaves the dock gated with its message', async () => {
    await throughIntro('invoice');
    expect(heading()).toBe('Bulk');

    await type('none');
    await click('.next');
    expect(heading()).toBe('Collected');
    expect(read('.count')).toBe('0');

    await click('.next');
    expect(heading()).toBe('Collected');
    expect(read('.blockers')).toContain('Add at least one device');

    await click('.add');
    await type('inv');
    await click('.next');
    expect(read('.count')).toBe('2');
  });
});
