import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiFormConfigBuilder, text } from 'formodel';
import { FormConfig } from '../../form';
import { provideFormadSuite } from '../../provide';
import { RuntimeStepper, StepperBuilder } from '../builder/stepper-builder';
import { StepperController } from '../types/controller';
import { StepFormsView } from '../ui/step-forms-view';
import { StepperComponent } from '../ui/stepper.component';

// A template given at the page, under a name, next to the pool: what `createForm` takes, placed where it is used.
// It is keyed, typed and committed by that name; each arm of a branch may place its own variant under one name.

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

type Address = { street: string };
const address = (label: string): FormConfig<Address> => ({
  model: () => ({ street: '' }),
  ui: UiFormConfigBuilder.from({ street: '' }).street(text(label)),
});

type Note = { note: string };
const noteForm: FormConfig<Note> = {
  model: () => ({ note: '' }),
  ui: UiFormConfigBuilder.from({ note: '' }).note(text('Note')),
};

@Component({
  selector: 'inline-chrome',
  imports: [StepFormsView],
  template: `
    @let c = controller();
    @if (c.step(); as step) {
      <ngx-formad-step-forms [step]="step" />
    }
    <span class="heading">{{ c.heading() }}</span>
    <button class="next" (click)="c.next()">Next</button>
  `,
})
class InlineChrome {
  readonly controller = input.required<StepperController>();
}

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" (stepCommitted)="last = $event" />`,
})
class DeliveryHost {
  last: Record<string, unknown> | null = null;

  readonly stepper: RuntimeStepper = new StepperBuilder()
    .withState({ place: 'work' as 'home' | 'work' })
    .createForm('note', noteForm)
    // A pool form and a page's own template side by side, each under its name.
    .createStep(
      (s) => s.createPage((p) => p.addForm('note').addForm('address', address('Home street')), { heading: 'Where' }),
      { name: 'where' },
    )
    // Each arm places its own variant under one name.
    .branch((c) => c.shared.place(), {
      home: (b) =>
        b.createStep((s) => s.createPage((p) => p.addForm('address', address('Home street again')), { heading: 'Home' }), {
          name: 'home',
        }),
      work: (b) =>
        b.createStep((s) => s.createPage((p) => p.addForm('address', address('Work street')), { heading: 'Work' }), {
          name: 'work',
        }),
    })
    // A loader given at the page resolves like a pool loader would.
    .createStep(
      (s) => s.createPage((p) => p.addForm('later', () => Promise.resolve(address('Later street'))), { heading: 'Later' }),
      {
        name: 'later',
        // Typed from the placement: `where` placed `address` at its page, so the instance reads here.
        activeWhen: (ctx) => ctx.steps.where.address.model().street !== 'nowhere',
      },
    )
    .build();
}

describe('A template given at the page', () => {
  let fixture: ComponentFixture<DeliveryHost>;

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const read = (selector: string) => (fixture.nativeElement.querySelector(selector) as HTMLElement).textContent!.trim();
  const inputs = () => Array.from(fixture.nativeElement.querySelectorAll('input') as NodeListOf<HTMLInputElement>);
  const type = async (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle(fixture);
  };
  const next = async () => {
    (fixture.nativeElement.querySelector('.next') as HTMLButtonElement).click();
    await settle(fixture);
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideFormadSuite({ stepper: InlineChrome })] });
    fixture = TestBed.createComponent(DeliveryHost);
    await settle(fixture);
  });

  it('is placed under its name next to the pool, and committed by it', async () => {
    expect(read('.heading')).toBe('Where');
    expect(text()).toContain('Note');
    expect(text()).toContain('Home street');

    await type(inputs()[1], 'Long Street 1');
    await next();

    const where = fixture.componentInstance.last!['where'] as Record<string, unknown>;
    expect(where['address']).toEqual({ street: 'Long Street 1' });
    expect(where['note']).toEqual({ note: '' });
  });

  it('lets each arm of a branch place its own variant under one name', async () => {
    await next();

    expect(read('.heading')).toBe('Work');
    expect(text()).toContain('Work street');
    expect(text()).not.toContain('Home street');
  });

  it('resolves a loader given at the page', async () => {
    await next();
    await next();
    // The loader settles over a chain of microtasks; give it a turn, then let the view catch up.
    await new Promise<void>((resolve) => setTimeout(resolve));
    await settle(fixture);

    expect(read('.heading')).toBe('Later');
    expect(text()).toContain('Later street');
  });
});

describe('A step placing one name twice', () => {
  it('is refused as it is built', () => {
    expect(() =>
      new StepperBuilder()
        .withState({})
        .createForm('note', noteForm)
        .createStep((s) => s.createPage((p) => p.addForm('note').addForm('note', noteForm), { heading: 'Twice' })),
    ).toThrow('places the form "note" twice');
  });
});
