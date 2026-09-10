import { Component, input, model, output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormValueControl } from '@angular/forms/signals';
import { CustomControlNode, customField, customInputType, text } from 'formodel';
import { RuntimeStepper, StepperBuilder } from './builders/stepper-builder';
import { defineForm, FormConfig } from './form-config/form-config';
import { formLayout } from './form-config/form-layout';
import { provideFormadSuite } from './provide';
import { FormRenderer } from './renderer/form-renderer';
import { instantiateForm } from './renderer/instantiate-form';
import { StepperComponent } from './runtime/stepper.component';

declare module 'formodel' {
  interface CustomControlNodes {
    stars: CustomControlNode<number, { max: number }>;
  }
}

const stars = customInputType<CustomControlNode<number, { max: number }>>('stars');

@Component({ selector: 'stars-control', template: `<span class="stars">max {{ props().max }}</span>` })
class StarsControl implements FormValueControl<number> {
  value = model(0);
  props = input.required<{ max: number }>();
}

const config: FormConfig<{ rating: number }> = {
  model: () => ({ rating: 0 }),
  ui: { rating: stars({ max: 5 }) },
};

@Component({
  imports: [FormRenderer],
  template: `<ngx-formad-form [state]="state" />`,
})
class Host {
  readonly state = instantiateForm(config);
}

async function pump(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 5; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

describe('Custom control kinds', () => {
  it('resolves a registered kind and forwards the node props', async () => {
    TestBed.configureTestingModule({
      providers: [provideFormadSuite({ controlTypes: { stars: StarsControl } })],
    });
    const fixture = TestBed.createComponent(Host);
    await pump(fixture);

    const el = fixture.nativeElement.querySelector('.stars') as HTMLElement;
    expect(el.textContent).toContain('max 5');
  });
});

const starForm: FormConfig<{ rating: number }> = {
  model: () => ({ rating: 0 }),
  ui: { rating: stars({ max: 7 }) },
};

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class StepperHost {
  readonly stepper: RuntimeStepper =     new StepperBuilder()
      .addControlType('stars', StarsControl)
      .createForm('f', starForm)
      .createStep((s) => s.createPage((p) => p.addForm('f'), { heading: '1' }))
      .build();
}

describe('Per-stepper control types', () => {
  it('resolves a wizard-scoped kind through the merged adapter', async () => {
    const fixture = TestBed.createComponent(StepperHost);
    await pump(fixture);

    const el = fixture.nativeElement.querySelector('.stars') as HTMLElement | null;
    expect(el?.textContent).toContain('max 7');
  });
});

@Component({
  selector: 'lookup-control',
  template: `<button class="lookup" type="button" (click)="resolved.emit('Acme')">go</button>`,
})
class LookupControl implements FormValueControl<string> {
  value = model('');
  resolved = output<string>();
}

type Lookup = { taxId: string; company: string };
const lookupForm = defineForm({
  model: (): Lookup => ({ taxId: '', company: '' }),
  ui: { taxId: customField(), company: text('Company') },
  layout: formLayout<Lookup>().control('taxId', { component: LookupControl }).field('company').build(),
});

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class EffectHost {
  readonly stepper: RuntimeStepper = new StepperBuilder()
    .createForm('f', lookupForm)
    .createStep((s) =>
      s.createPage(
        (p) =>
          p.addForm('f', {
            componentBindings: {
              taxId: { outputs: { resolved: (payload, ctx) => ctx.model.update((m) => ({ ...m, company: payload })) } },
            },
          }),
        { heading: '1' },
      ),
    )
    .build();
}

describe('addForm bindings', () => {
  it('wires a control output to a handler that patches a sibling field', async () => {
    const fixture = TestBed.createComponent(EffectHost);
    await pump(fixture);

    (fixture.nativeElement.querySelector('.lookup') as HTMLButtonElement).click();
    await pump(fixture);

    const company = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(company.value).toBe('Acme');
  });
});
