import { signal, WritableSignal } from '@angular/core';
import { FieldTree, form } from '@angular/forms/signals';
import { ErasedRecord, ErasedValue } from '../builders/step-context';
import {
  buildLayoutNodes,
  buildNodes,
  FieldConfig,
  FormConfig,
  FormLayoutItem,
  flattenFields,
  RenderNode,
} from '../form-config/form-config';
import { ReactiveUiConfig } from '../form-config/reactive';
import { LayoutSpec } from '../layout/layout-adapter';

/** A field tree viewed as one level of children by model key. */
export type FieldLevel = FieldTree<ErasedRecord>;

/** A field tree viewed as a repeating group's items by index. */
export type FieldItems = FieldTree<ErasedValue[]>;

/** Reads one child of a field level; throws when the model has no such key. */
export function childOf(level: FieldLevel, key: string): FieldTree<ErasedValue> {
  const child = level[key];
  if (child === undefined) throw new Error(`ngx-formad: the form model has no field "${key}".`);

  return child;
}

/** A form turned live: its model signal, native field tree, authored ui, render tree and scalar leaves. */
export interface FormState<
  M extends ErasedRecord,
  U extends ReactiveUiConfig<M> = ReactiveUiConfig<M>,
> {
  readonly model: WritableSignal<M>;

  readonly rootForm: FieldTree<M>;

  readonly ui: U;

  readonly nodes: readonly RenderNode[];

  readonly fields: readonly FieldConfig[];

  readonly grid?: LayoutSpec;
}

/** Builds live form state from a config; must run inside an injection context. */
export function instantiateForm<
  M extends ErasedRecord,
  U extends ReactiveUiConfig<M> = ReactiveUiConfig<M>,
>(config: FormConfig<M, U>): FormState<M, U> {
  const model = signal(config.model());
  const rootForm = config.schema ? form(model, config.schema) : form(model);
  const items = config.layout?.items as readonly FormLayoutItem<ErasedRecord>[] | undefined;

  return {
    model,
    rootForm,
    ui: config.ui,
    nodes: items ? buildLayoutNodes(config.ui, items) : buildNodes(config.ui),
    fields: flattenFields(config.ui),
    grid: config.layout?.grid,
  };
}
