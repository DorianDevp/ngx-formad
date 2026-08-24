import { Component, model } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { asStepper, RuntimeStepper, StepperBuilder } from '../builders/stepper-builder';
import { StandardSchemaOf } from '../builders/standard-schema';
import { StepperComponent } from './stepper.component';

// Proves the standalone-control pipeline end to end: `createControl` +
// `addControl` mounts a `FormValueControl` through the native `FormField`
// directive, its Standard Schema folds into the completion gate, a blocked Next
// *explains itself* through the chrome's blocker list, and the committed value
// egresses raw under the control's pool name (and into its bound shared key).

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

function buttonByText(fixture: ComponentFixture<unknown>, label: string): HTMLButtonElement | undefined {
  return Array.from(
    fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
  ).find((b) => b.textContent?.trim() === label);
}

@Component({
  selector: 'x-plan-picker',
  template: `
    <button type="button" class="pick" (click)="value.set('pro')">pick pro</button>
    <span class="chosen">{{ value() ?? 'none' }}</span>
  `,
})
class PlanPicker {
  readonly value = model<string | null>(null);
}

// A hand-rolled Standard Schema — the same contract zod 4 / valibot / arktype
// schemas satisfy — so the suite's tests need no validation dependency.
const planSchema: StandardSchemaOf<string | null> = {
  '~standard': {
    version: 1,
    vendor: 'ngx-formad-test',
    validate: (value) =>
      typeof value === 'string' && value.length > 0
        ? { value }
        : { issues: [{ message: 'Pick a plan first.' }] },
  },
};

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" (stepCommitted)="committed = $event" />`,
})
class ControlHost {
  committed: Record<string, unknown> | null = null;
  readonly built = new StepperBuilder()
    .withState({ plan: null as string | null })
    .createControl('plan', PlanPicker, { initial: null, schema: planSchema, label: 'Plan' })
    .createStep((s) =>
      s.createPage({ options: { heading: 'Choose' } }, (p) => p.addControl((c) => c.plan, { bind: 'plan' })),
    )
    .createStep((s) => s.createPage({ options: { heading: 'Done' } }, (p) => p.addContent()))
    .build();
  readonly stepper: RuntimeStepper = asStepper(this.built);
}

describe('addControl — standalone value controls', () => {
  it('renders the control and gates Next on its Standard Schema', async () => {
    const fixture = TestBed.createComponent(ControlHost);
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('.chosen')?.textContent).toContain('none');
    expect(buttonByText(fixture, 'Next')!.getAttribute('aria-disabled')).toBe('true');
  });

  it('explains a blocked Next with the schema issue, then advances once valid', async () => {
    const fixture = TestBed.createComponent(ControlHost);
    await settle(fixture);

    // A blocked Next is clickable on purpose — the click answers with reasons.
    buttonByText(fixture, 'Next')!.click();
    await settle(fixture);

    const blockers = fixture.nativeElement.querySelector('.ngx-formad-blockers');
    expect(blockers).toBeTruthy();
    expect(blockers.textContent).toContain('Plan');
    expect(blockers.textContent).toContain('Pick a plan first.');

    // Fixing the value retracts the blocker list without another click.
    (fixture.nativeElement.querySelector('.pick') as HTMLButtonElement).click();
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('.ngx-formad-blockers')).toBeFalsy();
    expect(buttonByText(fixture, 'Next')!.getAttribute('aria-disabled')).toBe('false');

    buttonByText(fixture, 'Next')!.click();
    await settle(fixture);

    // On the (content-only) last step: the picker is gone, Next became Finish.
    expect(fixture.nativeElement.querySelector('.pick')).toBeFalsy();
    expect(buttonByText(fixture, 'Finish')).toBeTruthy();
  });

  it('commits the raw value under the pool name and into the bound shared key', async () => {
    const fixture = TestBed.createComponent(ControlHost);
    await settle(fixture);

    (fixture.nativeElement.querySelector('.pick') as HTMLButtonElement).click();
    await settle(fixture);
    buttonByText(fixture, 'Next')!.click();
    await settle(fixture);

    const host = fixture.componentInstance;
    expect(host.committed?.['plan']).toBe('pro');
    expect(host.built.shared.get('plan')).toBe('pro');
  });
});
