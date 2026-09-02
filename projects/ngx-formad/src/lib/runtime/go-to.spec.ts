import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiFormConfigBuilder, text } from 'formodel';
import { asStepper, RuntimeStepper, StepperBuilder } from '../builders/stepper-builder';
import { FormConfig } from '../form-config/form-config';
import { provideFormadSuite } from '../provide';
import { StepFormsView } from './step-forms-view';
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

@Component({
  selector: 'jump-chrome',
  imports: [StepFormsView],
  template: `
    @let c = controller();
    @if (c.step(); as step) {
      <ngx-formad-step-forms [step]="step" />
    }
    <span class="idx">{{ c.index() }}</span>
    <span class="label">{{ c.label() }}</span>
    <button class="next" (click)="c.next()">Next</button>
    <button class="again" (click)="c.goTo('Device', { fresh: true })">Again</button>
    <button class="keep" (click)="c.goTo('Device')">Keep</button>
    <button class="nowhere" (click)="c.goTo('Nothing here')">Nowhere</button>
    <button class="byIndex" (click)="c.goTo(0)">First</button>
  `,
})
class JumpChrome {
  readonly controller = input.required<StepperController>();
}

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" (stepCommitted)="last = $event" />`,
})
class JumpHost {
  last: Record<string, unknown> | null = null;
  readonly stepper: RuntimeStepper = asStepper(
    new StepperBuilder()
      .withState({})
      .createForm('source', oneForm('Source'))
      .createForm('device', oneForm('Device'))
      .createForm('list', oneForm('List'))
      .createStep(
        (s) => s.createPage({ options: { heading: '1' } }, (p) => p.addForm((f) => f.source)),
        { name: 'source', label: 'Source' },
      )
      .createStep(
        (s) => s.createPage({ options: { heading: '2' } }, (p) => p.addForm((f) => f.device)),
        { name: 'device', label: 'Device' },
      )
      .createStep(
        (s) => s.createPage({ options: { heading: '3' } }, (p) => p.addForm((f) => f.list)),
        { name: 'list', label: 'List' },
      )
      .build(),
  );
}

describe('StepperController.goTo', () => {
  let fixture: ComponentFixture<JumpHost>;

  const idx = () => fixture.nativeElement.querySelector('.idx').textContent.trim();
  const label = () => fixture.nativeElement.querySelector('.label').textContent.trim();
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
    TestBed.configureTestingModule({ providers: [provideFormadSuite({ stepper: JumpChrome })] });
    fixture = TestBed.createComponent(JumpHost);
    await settle(fixture);

    await type('from the source');
    await click('.next');
    await type('AB-1');
    await click('.next');
  });

  it('lands on the step named by its label', async () => {
    expect(idx()).toBe('2');

    await click('.keep');

    expect(idx()).toBe('1');
    expect(label()).toBe('Device');
  });

  it('keeps what the user typed when the destination is revisited', async () => {
    await click('.keep');

    expect(shown()).toBe('AB-1');
  });

  it('rebuilds the destination from its factory when asked for a fresh one', async () => {
    await click('.again');

    expect(shown()).toBe('');
  });

  it('rebuilds the steps after the destination as well', async () => {
    await click('.again');
    await type('CD-2');
    await click('.next');
    await click('.next');
    await click('.again');
    await click('.next');

    expect(shown()).toBe('');
  });

  it('commits the step it leaves, like every other move', async () => {
    await click('.again');

    // Keyed by step, then by the pool name the step placed.
    expect(fixture.componentInstance.last).toEqual({
      source: { source: { v: 'from the source' } },
      device: { device: { v: 'AB-1' } },
      list: { list: { v: '' } },
    });
  });

  it('stays put when no step answers to the target', async () => {
    await click('.nowhere');

    expect(idx()).toBe('2');
  });

  it('takes a position as well as a label', async () => {
    await click('.byIndex');

    expect(label()).toBe('Source');
  });
});
