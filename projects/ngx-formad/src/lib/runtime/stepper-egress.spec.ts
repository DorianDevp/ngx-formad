import { Component, computed, inject, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiFormConfigBuilder, text } from 'formodel';
import { provideFormadSuite } from '../provide';
import { SharedState } from '../sync/shared-state';
import { asStepper, RuntimeStepper, StepperBuilder } from '../builders/stepper-builder';
import { FormConfig } from '../form-config/form-config';
import { StepFormsView } from './step-forms-view';
import { StepperController } from './stepper-controller';
import { StepperComponent } from './stepper.component';
import { FormadWizard } from './wizard-context';

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

describe('SharedState.reset', () => {
  it('restores initial values, including mutated nested objects', () => {
    const shared = new SharedState({ name: '', addr: { city: '' } });
    shared.patch({ name: 'Ada' });
    shared.slot('addr').write({ city: 'Kraków' });

    shared.reset();

    expect(shared.get('name')).toBe('');
    expect(shared.get('addr')).toEqual({ city: '' });
  });
});

type One = { v: string };
const oneForm: FormConfig<One> = {
  model: () => ({ v: '' }),
  ui: UiFormConfigBuilder.from({ v: '' }).v(text('Field')),
};

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" (stepCommitted)="last = $event" />`,
})
class EgressHost {
  last: Record<string, unknown> | null = null;
  readonly stepper: RuntimeStepper = asStepper(
    new StepperBuilder()
      .withState({})
      .createForm('a', oneForm)
      .createForm('b', oneForm)
      .createStep(
        (s) => s.createPage({ options: { heading: '1' } }, (p) => p.addForm((f) => f.a)),
        {
          name: 'first',
        },
      )
      .createStep((s) => s.createPage({ options: { heading: '2' } }, (p) => p.addForm((f) => f.b)))
      .build(),
  );
}

describe('StepperComponent — stepCommitted egress', () => {
  it('emits the committed models on Next', async () => {
    const fixture = TestBed.createComponent(EgressHost);
    await settle(fixture);

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'typed';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    const buttons = fixture.nativeElement.querySelectorAll(
      'button',
    ) as NodeListOf<HTMLButtonElement>;
    buttons[buttons.length - 1].click(); // Next
    await settle(fixture);

    expect(fixture.componentInstance.last).toEqual({ first: { a: { v: 'typed' } } });
  });
});

// A custom chrome exposing reset, so the test can drive it. It renders the step's
// forms through the real renderer (a text control → an <input>).
@Component({
  selector: 'reset-chrome',
  imports: [StepFormsView],
  template: `
    @let c = controller();
    @if (c.step(); as step) {
      <ngx-formad-step-forms [step]="step" />
    }
    <span class="idx">{{ c.index() }}</span>
    <button class="next" [disabled]="!c.canNext()" (click)="c.next()">Next</button>
    <button class="reset" (click)="c.reset()">Reset</button>
  `,
})
class ResetChrome {
  readonly controller = input.required<StepperController>();
}

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class ResetHost {
  readonly stepper: RuntimeStepper = asStepper(
    new StepperBuilder()
      .withState({})
      .createForm('a', oneForm)
      .createForm('b', oneForm)
      .createStep((s) => s.createPage({ options: { heading: '1' } }, (p) => p.addForm((f) => f.a)))
      .createStep((s) => s.createPage({ options: { heading: '2' } }, (p) => p.addForm((f) => f.b)))
      .build(),
  );
}

describe('StepperController.reset', () => {
  it('returns to the first step with fresh forms', async () => {
    TestBed.configureTestingModule({ providers: [provideFormadSuite({ stepper: ResetChrome })] });
    const fixture = TestBed.createComponent(ResetHost);
    await settle(fixture);

    const idx = () => fixture.nativeElement.querySelector('.idx').textContent.trim();
    const typeAndNext = async (value: string) => {
      const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      (fixture.nativeElement.querySelector('.next') as HTMLButtonElement).click();
      await settle(fixture);
    };

    await typeAndNext('hello'); // advance to step 2
    expect(idx()).toBe('1');

    (fixture.nativeElement.querySelector('.reset') as HTMLButtonElement).click();
    await settle(fixture);

    // Back to step 1, and its form is fresh (the model factory ran again).
    expect(idx()).toBe('0');
    expect((fixture.nativeElement.querySelector('input') as HTMLInputElement).value).toBe('');
  });
});

// A slot on a later step that reads collected data straight from DI.
@Component({ selector: 'wiz-summary', template: `<span class="sum">{{ value() }}</span>` })
class WizSummary {
  private readonly wiz = inject(FormadWizard, { optional: true });
  protected readonly value = computed(
    () => (this.wiz?.committed()['first'] as { a?: { v?: string } } | undefined)?.a?.v ?? '',
  );
}

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class WizCtxHost {
  readonly stepper: RuntimeStepper = asStepper(
    new StepperBuilder()
      .withState({})
      .createForm('a', oneForm)
      .createStep(
        (s) => s.createPage({ options: { heading: '1' } }, (p) => p.addForm((f) => f.a)),
        {
          name: 'first',
        },
      )
      .createStep((s) =>
        s.createPage({ options: { heading: '2' } }, (p) => p.addComponent(WizSummary, {})),
      )
      .build(),
  );
}

describe('FormadWizard — injectable context', () => {
  it('lets a slot read committed values without host wiring', async () => {
    const fixture = TestBed.createComponent(WizCtxHost);
    await settle(fixture);

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'typed';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    const buttons = fixture.nativeElement.querySelectorAll(
      'button',
    ) as NodeListOf<HTMLButtonElement>;
    buttons[buttons.length - 1].click(); // Next → commits 'a', enters step 2
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('.sum')?.textContent?.trim()).toBe('typed');
  });
});
