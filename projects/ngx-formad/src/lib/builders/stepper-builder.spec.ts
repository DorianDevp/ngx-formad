import { Component, input, inputBinding, output, outputBinding, signal } from '@angular/core';
import { UiFormConfigBuilder, email, text } from 'formodel';
import { FormConfig } from '../form-config/form-config';
import { ComponentNode, FormNode, LayoutNodeKind, StepNode } from './nodes';
import { isStepNode, SequenceNode } from './flow';
import { DeferTrigger, RuntimeStepContext } from './step-context';
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
        step.createPage((page) =>
          page
            .addComponent(Banner, { bindings: [inputBinding('tone', () => 'info'), outputBinding('dismissed', () => {})] })
            .addForm('account', {
              bind: { email: 'email' },
            }), { heading: 'Account' },
        ),
      )
      .createStep((step) =>
        step.createPage((page) =>
          page.addForm('billing', {
            bind: { email: 'email' },
          }), { heading: 'Billing' },
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
    expect(pagesAt(stepper.steps, 0)[0].options.heading?.()).toBe('Account');
  });

  it('records a form node selected by callback, with its shared links', () => {
    const stepper = buildStepper();
    const children = pagesAt(stepper.steps, 0)[0].children;
    const formNode = children.find((c) => c.kind === LayoutNodeKind.Form) as FormNode;

    expect(formNode.name).toBe('account');
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
        step.createPage((page) =>
          page.addForm('billing', {
            bind: { vat: 'vat' },
          }), { heading: 'Billing' },
        ),
      )
      .build();

    const formNode = pagesAt(stepper.steps, 0)[0].children.find(
      (c) => c.kind === LayoutNodeKind.Form,
    ) as FormNode;
    expect(formNode.links).toEqual([{ modelPath: ['vat'], sharedKey: 'vat' }]);
  });

  it('normalizes a dynamic component into bindings', () => {
    const stepper = buildStepper();
    const children = pagesAt(stepper.steps, 0)[0].children;
    const componentNode = children.find((c) => c.kind === LayoutNodeKind.Component) as ComponentNode;

    expect(componentNode.component).toBe(Banner);
    // One input binding (tone) and one output binding (dismissed).
    expect(componentNode.bindings(EMPTY_CONTEXT).length).toBe(2);
  });

  it('keeps a bindings callback and hands it the step context', () => {
    const seen: RuntimeStepContext[] = [];
    const stepper = new StepperBuilder()
      .withState({ email: '' })
      .createStep((step) =>
        step.createPage(
          (page) =>
            page.addComponent(Banner, {
              bindings: (ctx) => [inputBinding('tone', () => (ctx.shared.email() ? 'warn' : 'info'))],
            }),
          { heading: 'Account' },
        ),
      )
      .createStep((step) =>
        step.createPage(
          (page) =>
            page.addComponent(Banner, {
              bindings: (ctx) => {
                seen.push(ctx);

                return [];
              },
            }),
          { heading: 'Billing' },
        ),
      )
      .build();

    const componentAt = (index: number) =>
      pagesAt(stepper.steps, index)[0].children.find((c) => c.kind === LayoutNodeKind.Component) as ComponentNode;

    expect(componentAt(0).bindings(EMPTY_CONTEXT).length).toBe(1);
    expect(componentAt(1).bindings(EMPTY_CONTEXT)).toEqual([]);
    expect(seen[0]).toBe(EMPTY_CONTEXT);
  });

  it('seeds the shared store from withState', () => {
    const stepper = buildStepper();
    expect(stepper.shared.get('email')).toBe('');
  });

  it('records step-level when / optional / defer on the node', () => {
    const stepper = new StepperBuilder()
      .withState({ email: '' })
      .createForm('account', account)
      .createStep((step) => step.createPage((page) => page.addForm('account'), { heading: 'A' }), {
        optional: true,
        defer: DeferTrigger.Idle,
        when: ({ shared }) => shared.email() === 'go',
      })
      .build();

    const node = leafAt(stepper.steps, 0);
    expect(node.optional).toBe(true);
    expect(node.defer).toBe('idle');
    // The condition is stored erased but stays callable with a runtime context.
    expect(node.when?.({ steps: {}, shared: { email: signal('go') }, flow: undefined, parent: undefined })).toBe(true);
    expect(node.when?.({ steps: {}, shared: { email: signal('no') }, flow: undefined, parent: undefined })).toBe(false);
  });
});

// The fixtures above author leaf steps only, so indexing is narrowing, not hope.
function leafAt(steps: readonly SequenceNode[], index: number): StepNode {
  const node = steps[index];
  if (!isStepNode(node)) throw new Error(`step ${index} is not a leaf`);
  return node;
}

const EMPTY_CONTEXT: RuntimeStepContext = { steps: {}, shared: {}, flow: undefined, parent: undefined };

function pagesAt(steps: readonly SequenceNode[], index: number) {
  const step = leafAt(steps, index);

  return 'build' in step.pages ? step.pages.build(EMPTY_CONTEXT) : step.pages;
}
