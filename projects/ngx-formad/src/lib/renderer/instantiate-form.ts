import { signal, WritableSignal } from '@angular/core';
import { FieldTree, form } from '@angular/forms/signals';
import { UiFormGroupConfig } from 'formodel';
import {
  buildLayoutNodes,
  buildNodes,
  FieldConfig,
  FormConfig,
  FormLayoutItem,
  flattenFields,
  RenderNode,
} from '../form-config/form-config';
import { LayoutSpec } from '../layout/layout-adapter';

// Turning config into live state is the one step that needs an injection context
// — `form()` calls `inject()` internally. So it is a plain function, not a method
// on a builder, and the caller runs it where a context exists: a component
// constructor / field initializer, or `runInInjectionContext` from a navigation
// handler when a step is reached lazily. Keeping it separate also keeps the
// renderer itself pure: it draws a tree it is handed, it never builds one.

/** A form turned live: its model signal, its native (possibly nested) field tree,
 *  the recursive render tree, and a flat list of its scalar leaves. */
export interface FormState<M extends Record<string, unknown>> {
  readonly model: WritableSignal<M>;
  readonly rootForm: FieldTree<M>;
  /** The recursive render tree (controls, groups, arrays, and — with a layout
   *  overlay — components/rows) the renderer walks. */
  readonly nodes: readonly RenderNode[];
  /** Every scalar leaf, each with its full path — for folds over all fields. */
  readonly fields: readonly FieldConfig[];
  /** The container grid from a layout overlay, if the config declared one. */
  readonly grid?: LayoutSpec;
}

/** Builds live form state from config. Must run inside an injection context. */
export function instantiateForm<M extends Record<string, unknown>>(
  config: FormConfig<M>,
): FormState<M> {
  const model = signal(config.model());
  // `form()` owns its own writable derived from the model; validation lives in
  // the optional schema and stays entirely native — nested groups included.
  const rootForm = config.schema ? form(model, config.schema) : form(model);
  const ui = config.ui as UiFormGroupConfig<Record<string, unknown>>;
  // With a layout overlay, walk it (order + placement + components); otherwise the
  // declared field order. Either way `flattenFields` folds every declared field, so
  // validation covers fields a layout may have left out.
  const items = config.layout?.items as
    | readonly FormLayoutItem<Record<string, unknown>>[]
    | undefined;
  return {
    model,
    rootForm,
    nodes: items ? buildLayoutNodes(ui, items) : buildNodes(ui),
    fields: flattenFields(ui),
    grid: config.layout?.grid,
  };
}

/** Form state with its model type erased, as the renderer consumes it. */
export type RenderableForm = FormState<Record<string, unknown>>;

// The config is typed against the model (keys autocomplete, values are checked),
// but the renderer only ever walks the tree by string key, so it works on an
// erased view. `FieldTree<M>` is invariant in M — the value signals are writable
// — so widening needs one explicit step. This is that single, named step, so the
// erasure is honest and greppable instead of an `as any` sprinkled at call sites.
export function asRenderable<M extends Record<string, unknown>>(
  state: FormState<M>,
): RenderableForm {
  return state as unknown as RenderableForm;
}
