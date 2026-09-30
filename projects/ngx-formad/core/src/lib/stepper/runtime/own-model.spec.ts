import { Component, input, linkedSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { text, UiFormConfigBuilder } from 'formodel';
import { FormConfig } from '../../form';
import { link } from '../builder/shared-link';
import { StepperBuilder } from '../builder/stepper-builder';
import { StepRevisit } from '../types/nodes';
import { StepperComponent } from '../ui/stepper.component';

// A model of the author's own, where the stepper would make one: a config whose `model` factory returns
// a signal (one per instance) or whose `model` is a signal (one for all), and a shared key seeded with
// one. Each is how an input reaches a wizard without an effect.

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

type Lead = { company: string };
const leadForm: FormConfig<Lead> = {
  model: () => ({ company: '' }),
  ui: UiFormConfigBuilder.from({ company: '' }).company(text('Company')),
};

function driver(fixture: () => ComponentFixture<unknown>) {
  const root = () => fixture().nativeElement as HTMLElement;

  return {
    field: () => root().querySelector('input') as HTMLInputElement,
    heading: () => root().querySelector('.ngx-formad-heading')?.textContent?.trim(),
    press: async (label: string) => {
      Array.from(root().querySelectorAll('button'))
        .find((b) => b.textContent?.trim() === label)!
        .click();
      await settle(fixture());
    },
    type: async (value: string) => {
      const field = root().querySelector('input') as HTMLInputElement;
      field.value = value;
      field.dispatchEvent(new Event('input'));
      await settle(fixture());
    },
  };
}

// ── addForm with a config whose model factory returns a linkedSignal ──
@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class ModelFactoryHost {
  readonly lead = input.required<Lead>();
  readonly stepper = new StepperBuilder()
    .createForm('other', leadForm)
    .createStep(
      (s) =>
        s.createPage(
          (p) => p.addForm('lead', { ...leadForm, model: () => linkedSignal(() => ({ ...this.lead() })) }),
          { heading: 'Lead' },
        ),
      { revisit: StepRevisit.Fresh },
    )
    .createStep((s) => s.createPage((p) => p.addForm('other'), { heading: 'Other' }))
    .build();
}

describe('A placed form whose model factory returns a signal of its own', () => {
  let fixture: ComponentFixture<ModelFactoryHost>;
  const ui = driver(() => fixture);

  beforeEach(async () => {
    fixture = TestBed.createComponent(ModelFactoryHost);
    fixture.componentRef.setInput('lead', { company: 'Acme' });
    await settle(fixture);
  });

  it('draws the value the input put into the signal', () => {
    expect(ui.field().value).toBe('Acme');
  });

  it('follows the input the linked model is made over', async () => {
    fixture.componentRef.setInput('lead', { company: 'Beta' });
    await settle(fixture);

    expect(ui.field().value).toBe('Beta');
  });

  it('gives a fresh step a new linkedSignal: the edit is gone, the input is back', async () => {
    await ui.type('Typed');
    await ui.press('Next');
    expect(ui.heading()).toBe('Other');
    await ui.press('Back');

    expect(ui.field().value).toBe('Acme');
  });
});

// ── a pooled config whose model is a linkedSignal given as it is ──
@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class FormModelHost {
  readonly lead = input.required<Lead>();
  readonly model = linkedSignal(() => ({ ...this.lead() }));
  readonly stepper = new StepperBuilder()
    .createForm('lead', { ...leadForm, model: this.model })
    .createForm('other', leadForm)
    .createStep((s) => s.createPage((p) => p.addForm('lead'), { heading: 'Lead' }), { revisit: StepRevisit.Fresh })
    .createStep((s) => s.createPage((p) => p.addForm('other'), { heading: 'Other' }))
    .build();
}

describe('A placed form with a model of its own', () => {
  let fixture: ComponentFixture<FormModelHost>;
  const ui = driver(() => fixture);

  beforeEach(async () => {
    fixture = TestBed.createComponent(FormModelHost);
    fixture.componentRef.setInput('lead', { company: 'Acme' });
    await settle(fixture);
  });

  it('draws the value the input put into the model', () => {
    expect(ui.field().value).toBe('Acme');
  });

  it('follows the input the linked model is made over', async () => {
    fixture.componentRef.setInput('lead', { company: 'Beta' });
    await settle(fixture);

    expect(ui.field().value).toBe('Beta');
  });

  it('writes a user edit into the config’s signal', async () => {
    await ui.type('Typed');

    expect(fixture.componentInstance.model().company).toBe('Typed');
  });

  it('builds a fresh step over the same signal: the model is the config’s, not the instance’s', async () => {
    await ui.type('Typed');
    await ui.press('Next');
    expect(ui.heading()).toBe('Other');
    await ui.press('Back');

    expect(ui.heading()).toBe('Lead');
    expect(ui.field().value).toBe('Typed');
  });
});

// ── withState({ key: signal }) ──
@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class SharedModelHost {
  readonly company = signal('Acme');
  readonly stepper = new StepperBuilder()
    .withState({ company: this.company })
    // A later withState rebuilds the store; the signal must come through as the cell, not as its value.
    .withState({ note: '' })
    .createForm('first', leadForm)
    .createForm('second', leadForm)
    .createStep((s) =>
      s.createPage((p) => p.addForm('first', { fieldValueBindings: (f, st) => [link(f.company, st.company)] }), {
        heading: 'First',
      }),
    )
    .createStep((s) =>
      s.createPage((p) => p.addForm('second', { fieldValueBindings: (f, st) => [link(f.company, st.company)] }), {
        heading: 'Second',
      }),
    )
    .build();
}

describe('A shared key held in a signal of your own', () => {
  let fixture: ComponentFixture<SharedModelHost>;
  const ui = driver(() => fixture);

  beforeEach(async () => {
    fixture = TestBed.createComponent(SharedModelHost);
    await settle(fixture);
  });

  it('seeds a linked field from the signal', () => {
    expect(ui.field().value).toBe('Acme');
  });

  it('commits a linked field into the signal on leave', async () => {
    await ui.type('Typed');
    await ui.press('Next');

    expect(fixture.componentInstance.company()).toBe('Typed');
    expect(ui.field().value).toBe('Typed');
  });
});
