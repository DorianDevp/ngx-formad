import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiFormConfigBuilder, checkbox, text } from 'formodel';
import { FormConfig } from '../../form';
import { link } from '../builder/shared-link';
import { RuntimeStepper, StepperBuilder } from '../builder/stepper-builder';
import { StepperComponent } from '../ui/stepper.component';

// Two things the controller has to get right when a step's own commit changes the
// shape of the flow: a step that gates *itself* off is not "the last step", and a
// form nobody could see does not get to write its defaults into the wizard.

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

function buttonByText(fixture: ComponentFixture<unknown>, label: string): HTMLButtonElement {
  return Array.from(
    fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
  ).find((b) => b.textContent?.trim() === label)!;
}

type Skip = { skip: boolean };
const gateForm: FormConfig<Skip> = {
  model: () => ({ skip: false }),
  ui: UiFormConfigBuilder.from({ skip: false }).skip(checkbox('Skip the rest')),
};

type Only = { v: string };
const only = (label: string): FormConfig<Only> => ({
  model: () => ({ v: '' }),
  ui: UiFormConfigBuilder.from({ v: '' }).v(text(label)),
});

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" (completed)="finished = true" />`,
})
class SelfGatingHost {
  finished = false;

  readonly stepper: RuntimeStepper =     new StepperBuilder()
      .withState({ skip: false })
      .createForm('first', only('First'))
      .createForm('gate', gateForm)
      .createForm('last', only('Last'))
      .createStep((s) =>
        s.createPage((p) => p.addForm('first'), { heading: '1' }),
      )
      .createStep(
        (s) =>
          s.createPage((p) =>
            p.addForm('gate', {
              fieldValueBindings: (f, s) => [link(f.skip, s.skip)],
            }),
          { heading: '2' }),
        // The step is dropped by the very value its own form writes.
        { activeWhen: (ctx) => !ctx.shared.skip() },
      )
      .createStep((s) =>
        s.createPage((p) => p.addForm('last'), {  heading: '3' }),
      )
      .build();
}

describe('A step that gates itself off', () => {
  let fixture: ComponentFixture<SelfGatingHost>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(SelfGatingHost);
    await settle(fixture);
    buttonByText(fixture, 'Next').click();
    await settle(fixture);
  });

  it('advances to the next step instead of finishing the wizard', async () => {
    // On the gating step: tick the box, so committing it removes this step.
    const box = fixture.nativeElement.querySelector('input[type=checkbox]') as HTMLInputElement;
    expect(box).toBeTruthy();
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await settle(fixture);

    buttonByText(fixture, 'Next').click();
    await settle(fixture);

    expect(fixture.componentInstance.finished).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Last');
  });
});

// ── A hidden form's defaults must not overwrite the visible one's answer ────
const isCompany = signal(false);

type City = { city: string };
const cityForm = (label: string): FormConfig<City> => ({
  model: () => ({ city: '' }),
  ui: UiFormConfigBuilder.from({ city: '' }).city(text(label)),
});

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" (stepCommitted)="committed = $event" />`,
})
class BranchOnOneStepHost {
  committed: Record<string, unknown> = {};

  readonly stepper: RuntimeStepper =     new StepperBuilder()
      .withState({ city: '' })
      .createForm('personal', cityForm('Personal city'))
      .createForm('company', cityForm('Company city'))
      .createStep(
        (s) =>
          s.createPage((p) =>
            p
              .addForm('personal', {
                visibleWhen: () => !isCompany(),
                fieldValueBindings: (f, s) => [link(f.city, s.city)],
              })
              .addForm('company', {
                visibleWhen: () => isCompany(),
                fieldValueBindings: (f, s) => [link(f.city, s.city)],
              }), { heading: 'Where' }
          ),
        { name: 'where' },
      )
      .createStep((s) =>
        s.createPage((p) => p.addContent((c) => c.p('ok')), { heading: 'Done' }),
      )
      .build();
}

describe('A hidden form on a step', () => {
  it('neither commits its defaults nor clobbers the visible form', async () => {
    isCompany.set(false);
    const fixture = TestBed.createComponent(BranchOnOneStepHost);
    await settle(fixture);

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'Warsaw';
    input.dispatchEvent(new Event('input'));
    await settle(fixture);

    buttonByText(fixture, 'Next').click();
    await settle(fixture);

    const where = fixture.componentInstance.committed['where'] as Record<string, unknown>;
    expect(where['personal']).toEqual({ city: 'Warsaw' });
    // The company form was never on screen: no phantom blank model, and the
    // shared key it also binds is still what the visible form wrote.
    expect(where['company']).toBeUndefined();
    expect(fixture.componentInstance.stepper.shared.snapshot()['city']).toBe('Warsaw');
  });
});
