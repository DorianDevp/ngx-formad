import { Component, input, output } from '@angular/core';
import { UiFormConfigBuilder, email, text } from 'formodel';
import { FormConfig } from '../form-config/form-config';
import { ComponentNode, FormNode } from './nodes';
import { StepperBuilder } from './stepper-builder';

type Account = { email: string; password: string };
type Billing = { email: string; vat: string };

const account: FormConfig<Account> = {
  model: () => ({ email: '', password: '' }),
  ui: UiFormConfigBuilder.from({ email: '', password: '' })
    .email(email('Email'))
    .password(text('Password')),
};

const billing: FormConfig<Billing> = {
  model: () => ({ email: '', vat: '' }),
  ui: UiFormConfigBuilder.from({ email: '', vat: '' })
    .email(email('Billing email'))
    .vat(text('VAT')),
};

@Component({ selector: 'x-banner', template: '' })
class Banner {
  readonly tone = input<'info' | 'warn'>('info');
  readonly dismissed = output<void>();
}

describe('StepperBuilder', () => {
  function buildStepper() {
    return new StepperBuilder()
      .withState({ email: '' })
      .createForm('account', account)
      .createForm('billing', billing)
      .createStep((step) =>
        step.createPage({ options: { heading: 'Account' } }, (page) =>
          page
            .addComponent(Banner, { inputs: { tone: 'info' }, outputs: { dismissed: () => {} } })
            .addForm((f) => f.account, {
              submitLabel: 'Next',
              bind: (l) =>
                l.link(
                  (m) => m.email,
                  (s) => s.email,
                ),
            }),
        ),
      )
      .createStep((step) =>
        step.createPage({ options: { heading: 'Billing' } }, (page) =>
          page.addForm((f) => f.billing, {
            bind: (l) =>
              l.link(
                (m) => m.email,
                (s) => s.email,
              ),
          }),
        ),
      )
      .build();
  }

  it('collects the form pool under its declaration names', () => {
    const stepper = buildStepper();
    expect(Object.keys(stepper.forms)).toEqual(['account', 'billing']);
  });

  it('emits one step node per createStep, with a page each', () => {
    const stepper = buildStepper();
    expect(stepper.steps.length).toBe(2);
    expect(stepper.steps[0].pages[0].options.heading).toBe('Account');
  });

  it('records a form node selected by callback, with its shared links', () => {
    const stepper = buildStepper();
    const children = stepper.steps[0].pages[0].children;
    const formNode = children.find((c) => c.kind === 'form') as FormNode;

    expect(formNode.name).toBe('account');
    expect(formNode.submitLabel).toBe('Next');
    expect(formNode.links).toEqual([{ modelPath: ['email'], sharedKey: 'email' }]);
  });

  // Regression guard for the `addForm` key inference. `vat` exists on `billing`
  // but not on `account`; binding it only type-checks if `bind`'s model type is
  // narrowed to the selected form. If `K` widened back to the pool union, `m.vat`
  // would not exist and this would fail to compile, not just at runtime.
  it('types bind against the selected form, not the pool union', () => {
    const stepper = new StepperBuilder()
      .withState({ vat: '' })
      .createForm('account', account)
      .createForm('billing', billing)
      .createStep((step) =>
        step.createPage({ options: { heading: 'Billing' } }, (page) =>
          page.addForm((f) => f.billing, {
            bind: (l) =>
              l.link(
                (m) => m.vat,
                (s) => s.vat,
              ),
          }),
        ),
      )
      .build();

    const formNode = stepper.steps[0].pages[0].children.find(
      (c) => c.kind === 'form',
    ) as FormNode;
    expect(formNode.links).toEqual([{ modelPath: ['vat'], sharedKey: 'vat' }]);
  });

  it('normalizes a dynamic component into bindings', () => {
    const stepper = buildStepper();
    const children = stepper.steps[0].pages[0].children;
    const componentNode = children.find((c) => c.kind === 'component') as ComponentNode;

    expect(componentNode.component).toBe(Banner);
    // One input binding (tone) and one output binding (dismissed).
    expect(componentNode.bindings.length).toBe(2);
  });

  it('seeds the shared store from withState', () => {
    const stepper = buildStepper();
    expect(stepper.shared.get('email')).toBe('');
  });

  it('records step-level when / optional / defer on the node', () => {
    const stepper = new StepperBuilder()
      .withState({ email: '' })
      .createForm('account', account)
      .createStep((step) => step.createPage({ options: { heading: 'A' } }, (page) => page.addForm((f) => f.account)), {
        optional: true,
        defer: 'idle',
        when: ({ shared }) => shared.email === 'go',
      })
      .build();

    const node = stepper.steps[0];
    expect(node.optional).toBe(true);
    expect(node.defer).toBe('idle');
    // The condition is stored erased but stays callable with a runtime context.
    expect(node.when?.({ shared: { email: 'go' }, value: () => undefined })).toBe(true);
    expect(node.when?.({ shared: { email: 'no' }, value: () => undefined })).toBe(false);
  });
});
