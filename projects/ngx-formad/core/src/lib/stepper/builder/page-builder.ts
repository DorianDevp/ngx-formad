import { Type } from '@angular/core';
import { buildContent, ContentBuild } from '../../content';
import { PlacesCustomFields } from '../../form';
import { ContentCfg, FormCfg, RowCfg } from '../types/builder';
import { LayoutNode, LayoutNodeKind } from '../types/nodes';
import { ComponentCfg } from '../types/page-component';
import {
  AnyFormProvider,
  FormKeys,
  FormModel,
  FormPlaced,
  FormUi,
  RuntimeStepperContext,
  StepContext,
} from '../types/step-context';
import { fieldRefs, sharedSlots } from './shared-link';

/** A template given at the page: a config (`model` and `ui`) or a loader; a placement's options are neither. */
function isTemplate(value: unknown): value is AnyFormProvider {
  if (typeof value === 'function') return true;

  return typeof value === 'object' && value !== null && 'model' in value && 'ui' in value;
}

/** Builds one page: content, components and pooled forms; `P` accumulates the placed pool names. */
export class PageBuilder<TForms, TCtx extends RuntimeStepperContext, P = {}> {
  /** Phantom: the pool names this page placed. Carried by the type system, never read at runtime. */
  readonly __placed?: P;

  constructor(readonly nodes: readonly LayoutNode[] = []) {}

  addContent(build: ContentBuild, cfg: ContentCfg<StepContext<TCtx, TForms>> = {}): PageBuilder<TForms, TCtx, P> {
    return this.with({
      kind: LayoutNodeKind.Content,
      layout: cfg.layout,
      visibleWhen: cfg.visibleWhen,
      children: buildContent(build),
    });
  }

  addComponent(component: Type<object>, cfg: ComponentCfg<StepContext<TCtx, TForms>> = {}): PageBuilder<TForms, TCtx, P> {
    const bindings = cfg.bindings ?? [];

    return this.with({
      kind: LayoutNodeKind.Component,
      component,
      bindings: typeof bindings === 'function' ? bindings : () => bindings,
      visibleWhen: cfg.visibleWhen,
      layout: cfg.layout,
    });
  }

  insertRow<P2>(
    build: (row: PageBuilder<TForms, TCtx, {}>) => PageBuilder<TForms, TCtx, P2>,
    cfg: RowCfg<StepContext<TCtx, TForms>> = {},
  ): PageBuilder<TForms, TCtx, P & P2> {
    const row = build(new PageBuilder<TForms, TCtx, {}>());

    return new PageBuilder<TForms, TCtx, P & P2>([
      ...this.nodes,
      { kind: LayoutNodeKind.Row, layout: cfg.layout, visibleWhen: cfg.visibleWhen, children: row.nodes },
    ]);
  }

  /** Places a template given here under `name`: a config, or a loader for one — what `createForm` takes. */
  addForm<K extends string, F extends AnyFormProvider>(
    name: K,
    template: F & PlacesCustomFields<FormUi<F>, FormPlaced<F>>,
    cfg?: FormCfg<F, TCtx, TForms>,
  ): PageBuilder<TForms, TCtx, P & Record<K, F>>;
  /** Places a pool entry by name. */
  addForm<K extends FormKeys<TForms>>(
    name: K,
    cfg?: FormCfg<TForms[K], TCtx, TForms>,
  ): PageBuilder<TForms, TCtx, P & Record<K, TForms[K]>>;
  addForm(name: string, second?: unknown, third?: unknown): PageBuilder<TForms, TCtx, P> {
    const inline = isTemplate(second);
    const cfg = ((inline ? third : second) ?? {}) as FormCfg<AnyFormProvider, TCtx, TForms>;

    return new PageBuilder<TForms, TCtx, P>([
      ...this.nodes,
      {
        kind: LayoutNodeKind.Form,
        name,
        ...(inline ? { template: second } : {}),
        visibleWhen: cfg.visibleWhen,
        links: cfg.fieldValueBindings?.(fieldRefs<FormModel<AnyFormProvider>>(), sharedSlots<TCtx['shared']>()) ?? [],
        bindings: cfg.componentBindings ?? {},
        effects: (cfg.effects ?? []).map((run) => ({ run })),
        initial: cfg.initial,
        revisit: cfg.revisit,
      },
    ]);
  }

  private with(node: LayoutNode): PageBuilder<TForms, TCtx, P> {
    return new PageBuilder<TForms, TCtx, P>([...this.nodes, node]);
  }
}

/** A page's build callback; what it places accumulates in `P`. */
export type PageBuild<TForms, TCtx extends RuntimeStepperContext, P> = (
  page: PageBuilder<TForms, TCtx, {}>,
) => PageBuilder<TForms, TCtx, P>;
