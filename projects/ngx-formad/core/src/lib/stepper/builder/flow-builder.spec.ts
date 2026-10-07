import { ModelSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { text, UiFormConfigBuilder } from 'formodel';
import { FormConfig } from '../../form';
import { ContextOf, ControlKind, FormsOf, KindsOf, RecurrentTerminal } from '../types/builder';
import { SharedSignals } from '../../shared';
import { RingContext, RootContext, RuntimeStepperContext } from '../types/step-context';
import { FlowBuilder } from './flow-builder';
import { RecurrentStepperBuilder } from './recurrent-stepper-builder';
import { StepperBuilder } from './stepper-builder';

// One chain, two kinds. Every chain method hands back the kind it was called on, so a fragment written once against
// `FlowBuilder` reads on a root, an arm and a ring alike, and `use` keeps the caller's kind. These assertions fail to
// compile the day that changes.

type One = { v: string };
const form = (label: string): FormConfig<One> => ({
  model: () => ({ v: '' }),
  ui: UiFormConfigBuilder.from({ v: '' }).v(text(label)),
});

type Eq<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Extends<A, B> = [A] extends [B] ? true : false;
type MayBeAbsent<T> = undefined extends T ? true : false;

type Draft = { name: string };

/** A fragment with a requirement on the shared slice, written against the plain chain. */
type NeedsSource = RuntimeStepperContext & { readonly shared: SharedSignals<{ source: string }> };

function withSourceStep<TForms, TKinds extends string, TCtx extends NeedsSource>(builder: FlowBuilder<TForms, TKinds, TCtx>) {
  return builder
    .createForm('source', form('Source'))
    .createStep((s) => s.createPage((p) => p.addForm('source')), { name: 'source', activeWhen: (c) => c.shared.source() !== '' });
}

/** A control kind of the author's own: what `addControlType` takes is a class shaped like a `FormValueControl`. */
class SerialControl {
  readonly value!: ModelSignal<string>;
}

describe('FlowBuilder - one chain, kept per kind', () => {
  const root = new StepperBuilder().withState({ source: '' });
  const loop = new RecurrentStepperBuilder<{}, Draft[], ControlKind, RingContext<RootContext, Draft[]>>({ state: () => [] }).withState({ source: '' });

  it('hands the linear kind back from every chain method on a linear root', () => {
    const next = root.createForm('a', form('A')).createStep((s) => s.createPage((p) => p.addForm('a')), { name: 'a' });
    const linear: Extends<typeof next, StepperBuilder<{ a: FormConfig<One> }, ControlKind, RuntimeStepperContext>> = true;
    const built = TestBed.runInInjectionContext(() => next.build());
    const committed: Extends<NonNullable<NonNullable<(typeof built)['__result']>['a']>['a'], One> = true;

    expect([linear, committed]).toEqual([true, true]);
  });

  it('hands the ring kind back from every inherited chain method, so dock is still there', () => {
    const next = loop.createForm('a', form('A')).createStep((s) => s.createPage((p) => p.addForm('a')), { name: 'a' });
    const ring: Extends<typeof next, RecurrentStepperBuilder<{ a: FormConfig<One> }, Draft[], ControlKind, RuntimeStepperContext>> = true;
    const terminal: Extends<ReturnType<typeof next.dock>, RecurrentTerminal<unknown, RuntimeStepperContext, Draft[]>> = true;

    expect([ring, terminal]).toEqual([true, true]);
    expect(next.fold((state) => state).dock((s) => s.createPage((p) => p.addForm('a'))).define().recurrent).toBe(true);
  });

  it('is what a fragment is typed on: a ring and a linear chain both pass as the plain chain', () => {
    const asLinear: FlowBuilder<{}, ControlKind, ContextOf<typeof root>> = root;
    const asRing: FlowBuilder<{}, ControlKind, ContextOf<typeof loop>> = loop;
    const degraded = withSourceStep(loop);
    const plain: Extends<typeof degraded, FlowBuilder<{ source: FormConfig<One> }, ControlKind, RuntimeStepperContext>> = true;
    const notRing: Extends<typeof degraded, RecurrentStepperBuilder<unknown, unknown, string, RuntimeStepperContext>> = false;

    expect([asLinear, asRing]).toEqual([root, loop]);
    expect([plain, notRing]).toEqual([true, false]);
  });

  it('use() applies a fragment and keeps the caller’s kind, its pool and its entries', () => {
    const onRoot = root.use(withSourceStep);
    const onLoop = loop.use(withSourceStep);
    const rootKept: Extends<typeof onRoot, StepperBuilder<{ source: FormConfig<One> }, ControlKind, RuntimeStepperContext>> = true;
    const loopKept: Extends<typeof onLoop, RecurrentStepperBuilder<{ source: FormConfig<One> }, Draft[], ControlKind, RuntimeStepperContext>> = true;
    const entry: MayBeAbsent<ContextOf<typeof onLoop>['steps']['source']> = true;

    expect([rootKept, loopKept, entry]).toEqual([true, true, true]);
    expect(onLoop).toBeInstanceOf(RecurrentStepperBuilder);
    expect(onRoot).toBeInstanceOf(StepperBuilder);
    expect(Object.keys(onLoop.dock((s) => s.createPage((p) => p.addForm('source'))).define().forms)).toEqual(['source']);
  });

  it('carries the control kinds through: addControlType widens them on a ring, and use() reads them back', () => {
    const widened = loop.addControlType('serial', SerialControl);
    const kinds: Eq<KindsOf<typeof widened>, ControlKind | 'serial'> = true;
    const forms: Eq<FormsOf<typeof widened>, {}> = true;
    const kept: Extends<typeof widened, RecurrentStepperBuilder<{}, Draft[], ControlKind | 'serial', RuntimeStepperContext>> = true;

    expect([kinds, forms, kept]).toEqual([true, true, true]);
    expect(widened.dock((s) => s.createPage((p) => p.addContent((c) => c.p('x')))).define().controlTypes).toEqual({ serial: SerialControl });
  });

  it('keeps every terminal with its kind', () => {
    // @ts-expect-error dock is the ring's terminal
    expect(root.dock).toBeUndefined();
    // @ts-expect-error build is the linear terminal
    expect(loop.build).toBeUndefined();
    // @ts-expect-error fork is the linear terminal
    expect(loop.fork).toBeUndefined();
  });

  it('refuses a fragment whose requirement the chain does not meet', () => {
    const poor = new RecurrentStepperBuilder<{}, Draft[]>({ state: () => [] });
    // @ts-expect-error the ring seeds no `source`
    expect(() => poor.use(withSourceStep)).not.toThrow();
  });
});
