import { signal, untracked, WritableSignal } from '@angular/core';
import { FieldTree, form } from '@angular/forms/signals';
import { UiFormGroupConfig } from 'formodel';
import {
  buildLayoutNodes,
  buildNodes,
  ErasedUi,
  FieldConfig,
  FormConfig,
  flattenFields,
  RenderNode,
  RuntimeFormConfig,
} from '../form-config/form-config';
import { LayoutSpec } from '../layout/layout-adapter';

/** A field tree over an object value: its children are reachable by model key. */
export type FieldLevel<M extends Record<string, unknown> = Record<string, unknown>> = FieldTree<M>;

/** A field tree over one value, as the renderer hands it to a control. */
export type FieldLeaf<V = unknown> = FieldTree<V>;

/** A field tree over an array value: its items are reachable by index. */
export type FieldItems<V = unknown> = FieldTree<V[]>;

/** Narrows a field tree to an object level from its current value, read outside any reactive context. */
export function isLevel(tree: FieldLeaf): tree is FieldLevel {
  const value = untracked(() => tree().value());

  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Narrows a field tree to a repeating group's items from its current value, read outside any reactive context. */
export function isItems(tree: FieldLeaf): tree is FieldItems {
  return Array.isArray(untracked(() => tree().value()));
}

/** A live form: its model signal, the erased field tree the renderer walks, the authored ui, render tree and leaves. */
export interface FormState<
  M extends Record<string, unknown> = Record<string, unknown>,
  U extends ErasedUi = ErasedUi,
> {
  readonly model: WritableSignal<M>;

  readonly rootForm: FieldLevel;

  readonly ui: U;

  readonly nodes: readonly RenderNode[];

  readonly fields: readonly FieldConfig[];

  readonly grid?: LayoutSpec;
}

function renderTree(config: RuntimeFormConfig): Pick<FormState, 'nodes' | 'fields' | 'grid'> {
  const items = config.layout?.items;

  return {
    nodes: items ? buildLayoutNodes(config.ui, items) : buildNodes(config.ui),
    fields: flattenFields(config.ui),
    grid: config.layout?.grid,
  };
}

/** Builds live form state from a typed config; must run inside an injection context. */
export function instantiateForm<M extends Record<string, unknown>, U extends UiFormGroupConfig<M> & ErasedUi>(
  config: FormConfig<M, U> & RuntimeFormConfig,
): FormState<M, U> {
  const model = signal(config.model());
  const erased: FormState['model'] = model;
  const schema = config.schema;

  return { model, rootForm: schema ? form(erased, schema) : form(erased), ui: config.ui, ...renderTree(config) };
}

/** Builds live form state from a runtime template; must run inside an injection context. */
export function instantiateRuntimeForm(config: RuntimeFormConfig): FormState {
  const model = signal(config.model());
  const schema = config.schema;

  return { model, rootForm: schema ? form(model, schema) : form(model), ui: config.ui, ...renderTree(config) };
}
