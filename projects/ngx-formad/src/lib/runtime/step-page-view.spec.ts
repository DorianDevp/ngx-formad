import { Component, input, inputBinding, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { required } from '@angular/forms/signals';
import { UiFormConfigBuilder, text } from 'formodel';
import { StepRevisit } from '../builders/nodes';
import { RuntimeStepper, StepPages, StepperBuilder } from '../builders/stepper-builder';
import { FormConfig } from '../form-config/form-config';
import { StepperComponent } from './stepper.component';

// Proves the page renderer the chrome now uses draws a step's *whole* tree —
// dynamic components beside forms, and a component-only step gated by
// `completeWhen` — not just the flat form list.

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

@Component({ selector: 'x-banner', template: `<div class="x-banner">{{ note() }}</div>` })
class Banner {
  readonly note = input('');
}

type Only = { v: string };
const onlyForm: FormConfig<Only> = {
  model: () => ({ v: '' }),
  ui: UiFormConfigBuilder.from({ v: '' }).v(text('Field')),
};

const requiredForm: FormConfig<Only> = {
  model: () => ({ v: '' }),
  ui: UiFormConfigBuilder.from({ v: '' }).v(text('Must fill')),
  schema: (p) => required(p.v),
};

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class ComponentHost {
  readonly stepper: RuntimeStepper =     new StepperBuilder()
      .withState({})
      .createForm('only', onlyForm)
      .createStep((s) =>
        s.createPage((p) =>
          p.addComponent(Banner, { bindings: [inputBinding('note', () => 'hello from a slot')] }).addForm('only'), { heading: 'One' },
        ),
      )
      .build();
}

describe('StepPageView — dynamic components', () => {
  it('renders a page component alongside the form', async () => {
    const fixture = TestBed.createComponent(ComponentHost);
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('input')).toBeTruthy();
    const banner = fixture.nativeElement.querySelector('.x-banner');
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain('hello from a slot');
  });
});

// A component-only step: no forms to fold, so it is vacuously complete — the
// `completeWhen` gate is what holds Next until the host's signal flips.
const ready = signal(false);

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class GatedHost {
  readonly stepper: RuntimeStepper =     new StepperBuilder()
      .withState({})
      .createStep(
        (s) => s.createPage((p) => p.addComponent(Banner, { bindings: [inputBinding('note', () => 'choose')] }), { heading: 'Pick' }),
        { completeWhen: () => ready() },
      )
      .createStep((s) => s.createPage((p) => p.addComponent(Banner, { bindings: [inputBinding('note', () => 'done')] }), { heading: 'Done' }))
      .build();
}

describe('StepPageView — completeWhen gate', () => {
  it('gates Next on a component-only step until the guard passes', async () => {
    ready.set(false);
    const fixture = TestBed.createComponent(GatedHost);
    await settle(fixture);

    expect(buttonByText(fixture, 'Next')!.getAttribute('aria-disabled')).toBe('true');

    ready.set(true);
    await settle(fixture);

    expect(buttonByText(fixture, 'Next')!.getAttribute('aria-disabled')).toBe('false');
  });
});

// The guard receives the same context as `activeWhen`, so a component-only step can
// gate Next on the live shared state — no closed-over signal needed.
@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class SharedGatedHost {
  readonly built = new StepperBuilder()
    .withState({ agreed: false })
    .createStep(
      (s) => s.createPage((p) => p.addComponent(Banner, { bindings: [inputBinding('note', () => 'agree')] }), { heading: 'Consent' }),
      { completeWhen: (ctx) => ctx.shared.agreed() },
    )
    .createStep((s) => s.createPage((p) => p.addComponent(Banner, { bindings: [inputBinding('note', () => 'done')] }), { heading: 'Done' }))
    .build();
  readonly stepper: RuntimeStepper = (this.built);
}

describe('StepPageView — completeWhen context', () => {
  it('re-evaluates the guard when the shared state it reads changes', async () => {
    const fixture = TestBed.createComponent(SharedGatedHost);
    await settle(fixture);

    expect(buttonByText(fixture, 'Next')!.getAttribute('aria-disabled')).toBe('true');

    fixture.componentInstance.built.shared.patch({ agreed: true });
    await settle(fixture);

    expect(buttonByText(fixture, 'Next')!.getAttribute('aria-disabled')).toBe('false');
  });
});

// A component's bindings and its `visibleWhen` may be callbacks over the step context, so
// a component on a STATIC step binds and gates on what an earlier step holds — no
// `pages: StepPages.OnEntry` for the sake of one input or one @if. The predecessor here revisits
// fresh, so its instance is a different object on the second pass: what the callbacks
// close over must be the live context, not the record as it stood when the step was
// entered.
@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class ContextBoundHost {
  readonly stepper: RuntimeStepper = new StepperBuilder()
    .createForm('only', onlyForm)
    .createStep((s) => s.createPage((p) => p.addForm('only'), { heading: 'Type' }), {
      name: 'typed',
      revisit: StepRevisit.Fresh,
    })
    .createStep((s) =>
      s.createPage(
        (p) =>
          p
            .addComponent(Banner, {
              bindings: (ctx) => [inputBinding('note', () => ctx.steps.typed.only.model().v)],
            })
            .addComponent(Banner, {
              bindings: [inputBinding('note', () => 'gated')],
              visibleWhen: (ctx) => ctx.steps.typed.only.model().v === 'Beta',
            }),
        { heading: 'Echo' },
      ),
    )
    .build();
}

describe('StepPageView — component bindings over the step context', () => {
  it('binds and gates a component on a predecessor form, and follows the step that is built again', async () => {
    const fixture = TestBed.createComponent(ContextBoundHost);
    await settle(fixture);

    const root = fixture.nativeElement as HTMLElement;
    const field = () => root.querySelector('input') as HTMLInputElement;
    const banners = () => Array.from(root.querySelectorAll('.x-banner')).map((b) => b.textContent?.trim());
    const press = async (label: string) => {
      buttonByText(fixture, label)!.click();
      await settle(fixture);
    };
    const type = async (value: string) => {
      field().value = value;
      field().dispatchEvent(new Event('input'));
      await settle(fixture);
    };

    await type('Acme');
    await press('Next');
    expect(banners()).toEqual(['Acme']);

    await press('Back');
    await type('Beta');
    await press('Next');
    expect(banners()).toEqual(['Beta', 'gated']);
  });
});

// The same for the other two page nodes: a pooled form and a content block gate on the
// step context. Both are drawn by the page renderer's own @if, so nothing about the
// step's structure follows the context — only whether these two are in the DOM.
@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class GatedNodesHost {
  readonly stepper: RuntimeStepper = new StepperBuilder()
    .createForm('only', onlyForm)
    .createStep((s) => s.createPage((p) => p.addForm('only'), { heading: 'Type' }), { name: 'typed' })
    .createStep((s) =>
      s.createPage(
        (p) =>
          p
            .addContent((c) => c.p('extras'), { visibleWhen: (ctx) => ctx.steps.typed.only.model().v === 'more' })
            .addForm('only', { visibleWhen: (ctx) => ctx.steps.typed.only.model().v === 'more' }),
        { heading: 'Extras' },
      ),
    )
    .build();
}

// A row and a whole page gate on the context too. The gate of a container is not only a
// matter of drawing: a form inside a hidden row must not hold Next either, so `mustFill`
// below is empty and required while its row is away, and Next still moves.
const rowOpen = signal(false);

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class GatedContainersHost {
  readonly stepper: RuntimeStepper = new StepperBuilder()
    .withState({})
    .createForm('mustFill', requiredForm)
    .createStep((s) =>
      s
        .createPage(
          (p) => p.insertRow((row) => row.addForm('mustFill'), { layout: 'cols-1', visibleWhen: () => rowOpen() }),
          { heading: 'One' },
        )
        .createPage((p) => p.addContent((c) => c.p('second page')), { visibleWhen: () => rowOpen() }),
    )
    .createStep((s) => s.createPage((p) => p.addContent((c) => c.p('done')), { heading: 'Done' }))
    .build();
}

describe('StepPageView — a row and a page gated on the context', () => {
  it('keeps the hidden row out of the DOM and out of the completion gate', async () => {
    rowOpen.set(false);
    const fixture = TestBed.createComponent(GatedContainersHost);
    await settle(fixture);

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.ngx-formad-row')).toBeNull();
    expect(root.querySelector('input')).toBeNull();
    expect(root.textContent).not.toContain('second page');
    // The required field is empty, but nobody can see it: Next is free.
    expect(buttonByText(fixture, 'Next')!.getAttribute('aria-disabled')).toBe('false');

    rowOpen.set(true);
    await settle(fixture);

    expect(root.querySelector('.ngx-formad-row input')).toBeTruthy();
    expect(root.textContent).toContain('second page');
    expect(buttonByText(fixture, 'Next')!.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('StepPageView — a form and a content block gated on the step context', () => {
  it('draws neither until the predecessor says so, then both', async () => {
    const fixture = TestBed.createComponent(GatedNodesHost);
    await settle(fixture);

    const root = fixture.nativeElement as HTMLElement;
    const field = () => root.querySelector('input') as HTMLInputElement;
    const press = async (label: string) => {
      buttonByText(fixture, label)!.click();
      await settle(fixture);
    };
    const type = async (value: string) => {
      field().value = value;
      field().dispatchEvent(new Event('input'));
      await settle(fixture);
    };

    await type('plain');
    await press('Next');
    expect(root.querySelector('.ngx-formad-content p')).toBeNull();
    expect(root.querySelector('input')).toBeNull();

    await press('Back');
    await type('more');
    await press('Next');
    expect(root.querySelector('.ngx-formad-content p')?.textContent).toBe('extras');
    expect(root.querySelector('input')).toBeTruthy();
  });
});
