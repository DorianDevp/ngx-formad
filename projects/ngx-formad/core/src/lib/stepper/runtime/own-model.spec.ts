import { Component, input, linkedSignal, signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { text, UiFormConfigBuilder } from 'formodel';
import { FormConfig } from '../../form';
import { link } from '../builder/shared-link';
import { StepperBuilder } from '../builder/stepper-builder';
import { StepRevisit } from '../types/nodes';
import { StepperComponent } from '../ui/stepper.component';

// A model of the author's own, where the stepper would make one: a placed form takes a factory
// (one call per instance, since a ring pass or a fresh step brings a new one), the shared store
// takes a signal as a key's cell. Both are how an input reaches a wizard without an effect.

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

// ── addForm(name, { model }) ──
@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class FormModelHost {
  readonly lead = input<Lead>({ company: '' });
  readonly made: WritableSignal<Lead>[] = [];
  readonly stepper = new StepperBuilder()
    .createForm('lead', leadForm)
    .createStep((s) =>
      s.createPage(
        (p) =>
          p.addForm('lead', {
            model: () => {
              const model = linkedSignal(() => ({ ...this.lead() }));
              this.made.push(model);

              return model;
            },
          }),
        { heading: 'Lead' },
      ),
      { revisit: StepRevisit.Fresh },
    )
    .createStep((s) => s.createPage((p) => p.addForm('lead'), { heading: 'Other' }))
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

  it('draws the value the factory made', () => {
    expect(ui.field().value).toBe('Acme');
  });

  it('follows the input the linked model is made over', async () => {
    fixture.componentRef.setInput('lead', { company: 'Beta' });
    await settle(fixture);

    expect(ui.field().value).toBe('Beta');
  });

  it('writes a user edit into the signal the factory made', async () => {
    await ui.type('Typed');

    expect(fixture.componentInstance.made.at(-1)!().company).toBe('Typed');
  });

  it('calls the factory once per instance: a fresh step gets a new signal', async () => {
    expect(fixture.componentInstance.made).toHaveLength(1);

    await ui.press('Next');
    expect(ui.heading()).toBe('Other');
    await ui.press('Back');

    expect(fixture.componentInstance.made).toHaveLength(2);
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
