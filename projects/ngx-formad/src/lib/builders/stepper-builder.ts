import { Type } from '@angular/core';
import { FormConfig } from '../form-config/form-config';
import { SharedState } from '../sync/shared-state';
import { ComponentCfg, toBindings } from './dynamic-component';
import { LayoutNode, PageNode, PageOptions, StepNode } from './nodes';
import { FieldRef, FieldRefs, recordLinks, selectedKey, SharedLink } from './shared-link';
import {
  AnyFormProvider,
  DeferTrigger,
  FormModel,
  FormProvider,
  RuntimeStepCondition,
  StepCondition,
  StepContext,
} from './step-context';

// One typed chain describes the whole wizard. Only `TForms` is threaded through
// the generics: `createForm` narrows it, and `addForm`/`bind` read it. There is
// no step/child tuple accumulator — nothing at a use site reads one, and the
// renderer walks plain `StepNode[]` generically. Per-call generics (`C`, `K`)
// still give full local inference.

// The erased pool entry. We don't bound the builder type params by this: a
// concrete `FormConfig<Account>` is not assignable to `FormConfig<Record<…>>`
// (the `schema` field makes it invariant in the model), so a bound would reject
// the very forms the chain creates. The precise types live on the per-call
// generics instead; this alias is only the erased shape the runtime walks.
type AnyForm = FormConfig<Record<string, unknown>>;

/** Builds the contents of one page. Also used for nested rows (it returns `this`). */
export class PageBuilder<TForms, TShared extends Record<string, unknown>> {
  private readonly children: LayoutNode[] = [];

  /** A bare layout slot — a spacer, a full-width gap. */
  addContent(cfg: { layout?: string } = {}): this {
    this.children.push({ kind: 'content', layout: cfg.layout });
    return this;
  }

  /** A dynamic component, its inputs/outputs typed to the component itself. */
  addComponent<C>(component: Type<C>, cfg: ComponentCfg<C>): this {
    this.children.push({
      kind: 'component',
      component: component as Type<unknown>,
      bindings: toBindings(cfg),
      visibleWhen: cfg.visibleWhen,
      layout: cfg.layout,
    });
    return this;
  }

  /** A nested layout group with its own classes. */
  insertRow(layout: string, build: (row: PageBuilder<TForms, TShared>) => unknown): this {
    const row = new PageBuilder<TForms, TShared>();
    build(row);
    this.children.push({ kind: 'row', layout, children: row.drain() });
    return this;
  }

  /** A form from the pool, selected by callback, optionally linked to shared state. */
  // `K` is inferred from the selected `FieldRef`'s `__key`, not from the indexed
  // return type `FieldRefs<TForms>[K]` — TS cannot infer a type param out of an
  // indexed access in return position and silently widens it to `keyof TForms`,
  // which would type `bind` against the union of every pooled model. Reading the
  // key off the ref pins `K` to the one form selected, so `FormModel` is exact.
  addForm<K extends keyof TForms & string>(
    select: (forms: FieldRefs<TForms>) => FieldRef<K, unknown>,
    opts: {
      submitLabel?: string;
      visibleWhen?: () => boolean;
      bind?: (link: SharedLink<FormModel<TForms[K]>, TShared>) => void;
    } = {},
  ): this {
    const name = selectedKey<TForms>(
      select as (f: FieldRefs<TForms>) => FieldRef<keyof TForms, unknown>,
    );
    this.children.push({
      kind: 'form',
      name,
      submitLabel: opts.submitLabel,
      visibleWhen: opts.visibleWhen,
      links: opts.bind ? recordLinks(opts.bind) : [],
    });
    return this;
  }

  /** Hands the accumulated nodes to the parent; internal to the builders. */
  drain(): LayoutNode[] {
    return this.children;
  }
}

/** Builds one step out of one or more pages. */
export class StepBuilder<TForms, TShared extends Record<string, unknown>> {
  private readonly pages: PageNode[] = [];

  createPage(
    meta: { options: PageOptions },
    build: (page: PageBuilder<TForms, TShared>) => unknown,
  ): this {
    const page = new PageBuilder<TForms, TShared>();
    build(page);
    this.pages.push({ options: meta.options, children: page.drain() });
    return this;
  }

  drain(): StepNode {
    return { pages: this.pages };
  }
}

/** A built wizard: its typed form pool, its step tree, and its shared store. */
export class Stepper<TForms, TShared extends Record<string, unknown>> {
  constructor(
    readonly forms: TForms,
    readonly steps: readonly StepNode[],
    readonly shared: SharedState<TShared>,
  ) {}
}

/** A stepper with its precise pool/shared types erased, as the runtime sees it. */
export type RuntimeStepper = Stepper<Record<string, AnyForm>, Record<string, unknown>>;

// The built `Stepper` is the source of truth for step conditions: these pull its
// form pool and shared shape back out, so a `when` predicate — at authoring time
// or in a typed host — reads `shared` and `value(...)` against the exact wizard.
/** The form pool of a built stepper. */
export type StepperForms<S> = S extends Stepper<infer F, infer _> ? F : never;
/** The shared-state shape of a built stepper. */
export type StepperShared<S> = S extends Stepper<infer _, infer Sh> ? Sh : never;
/** The typed step context derived from a built stepper. */
export type StepContextFor<S extends Stepper<any, any>> = StepContext<
  StepperForms<S>,
  StepperShared<S>
>;
/** A step condition typed against a built stepper. */
export type StepConditionFor<S extends Stepper<any, any>> = StepCondition<
  StepperForms<S>,
  StepperShared<S>
>;

/** Per-step options, typed against the stepper the step belongs to. */
export interface StepOptions<S extends Stepper<any, any>> {
  /** Drops the step from the sequence when it returns false; reactive. */
  readonly when?: StepConditionFor<S>;
  /** Marks the step skippable — the shell shows a Skip that bypasses the gate. */
  readonly optional?: boolean;
  /** Renders the step body inside an `@defer` block with this trigger. */
  readonly defer?: DeferTrigger;
}

// The chain is typed for authoring; the runtime walks the pool by string name
// and the shared store by string key, so it works on an erased view. `SharedState`
// is invariant in its state type, so this widening needs one explicit step —
// the single, named place that erasure happens, like `asRenderable` for a form.
export function asStepper<TForms, TShared extends Record<string, unknown>>(
  stepper: Stepper<TForms, TShared>,
): RuntimeStepper {
  return stepper as unknown as RuntimeStepper;
}

/** The root of the chain. Each method narrows or appends; `build()` freezes it. */
export class StepperBuilder<TForms = {}, TShared extends Record<string, unknown> = {}> {
  // The pool stores configs or lazy loaders; the runtime resolves loaders on reach.
  private readonly forms: Record<string, AnyFormProvider> = {};
  private sharedInit: Record<string, unknown> = {};
  private readonly steps: StepNode[] = [];

  /** Declares the cross-step shared state; narrows `TShared`. */
  withState<S extends Record<string, unknown>>(initial: S): StepperBuilder<TForms, S> {
    this.sharedInit = initial;
    return this as unknown as StepperBuilder<TForms, S>;
  }

  /** Registers a form in the pool under `name`; narrows `TForms`. The provider may
   *  be the config itself or a loader (`() => Promise<FormConfig<M>>`) for a form
   *  whose definition is fetched only when its step is reached — either way the
   *  pool type records `FormConfig<M>`, so `addForm`/`bind`/`value` are unchanged. */
  createForm<K extends string, M extends Record<string, unknown>>(
    name: K,
    provider: FormProvider<M>,
  ): StepperBuilder<TForms & Record<K, FormConfig<M>>, TShared> {
    this.forms[name] = provider as unknown as AnyFormProvider;
    return this as unknown as StepperBuilder<TForms & Record<K, FormConfig<M>>, TShared>;
  }

  /** Appends a step built from the typed pool and shared state. `opts.when`,
   *  `optional`, and `defer` ride on the step node; `when` is typed against the
   *  stepper this chain builds, then erased once here, where the node is stored. */
  createStep(
    build: (step: StepBuilder<TForms, TShared>) => unknown,
    opts: StepOptions<Stepper<TForms, TShared>> = {},
  ): this {
    const step = new StepBuilder<TForms, TShared>();
    build(step);
    this.steps.push({
      ...step.drain(),
      when: opts.when as unknown as RuntimeStepCondition,
      optional: opts.optional,
      defer: opts.defer,
    });
    return this;
  }

  build(): Stepper<TForms, TShared> {
    return new Stepper(
      this.forms as unknown as TForms,
      this.steps,
      new SharedState(this.sharedInit as TShared),
    );
  }
}
