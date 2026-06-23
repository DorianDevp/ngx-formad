import { SchemaOrSchemaFn } from '@angular/forms/signals';
import { UiFormControlNode, UiFormGroupConfig } from 'formodel';
import { ItemSpec } from '../layout/layout-adapter';

// form-config is the render description, not a rival to native `form()`. formodel
// already turns a model into a typed config of nodes (kind + label + options);
// this layer only adapts that config into a flat list the renderer can walk and
// attach a layout hint to. Validation and field state stay entirely native.

/** One field ready to render: the model key, its formodel node, a layout hint. */
export interface FieldConfig {
  /** The top-level model key this field edits. */
  readonly key: string;
  /** The formodel node — `type` is the control kind, plus label/options/etc. */
  readonly node: UiFormControlNode;
  /** Optional per-field layout, applied by the layout adapter's `item()`. */
  readonly layout?: ItemSpec;
}

/**
 * One form as renderable data: a factory for a fresh model (so the same form
 * reused in two steps stays two independent instances), the formodel UI config
 * that drives rendering, and an optional native schema that owns validation.
 */
export interface FormConfig<M extends Record<string, unknown>> {
  readonly model: () => M;
  readonly ui: UiFormGroupConfig<M>;
  readonly schema?: SchemaOrSchemaFn<M>;
}

// Group nodes carry `controlsConfig`, array nodes carry `itemConfig`. A plain
// control node has neither; that is how we tell a renderable scalar field apart
// from the nested shapes the flat renderer does not yet descend into.
function isControlNode(node: unknown): node is UiFormControlNode {
  return (
    !!node && typeof node === 'object' && !('controlsConfig' in node) && !('itemConfig' in node)
  );
}

/**
 * Flattens a formodel config into the renderer's field list. Only top-level
 * scalar controls are emitted; nested groups and arrays are skipped for now,
 * since they need recursive layout the flat renderer does not provide.
 */
export function flattenFields(ui: UiFormGroupConfig<Record<string, unknown>>): FieldConfig[] {
  const fields: FieldConfig[] = [];
  for (const [key, node] of Object.entries(ui)) {
    if (isControlNode(node)) fields.push({ key, node });
  }
  return fields;
}

/**
 * The non-contract inputs a control needs beyond the field binding. `FormField`
 * supplies value/errors/disabled/touched/required from the field; this fills in
 * the purely presentational extras the node carries — label, input type, select
 * options — which the renderer feeds as plain input bindings.
 */
export function extraInputsFor(node: UiFormControlNode): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};

  if (node.label != null) inputs['label'] = node.label;
  if (node.placeholder) inputs['placeholder'] = node.placeholder;

  switch (node.type) {
    case 'text':
    case 'email':
    case 'password':
    case 'tel':
    case 'url':
      // One text control backs all five; the kind only sets the native type.
      inputs['type'] = node.type;
      break;
    case 'textarea':
      if (node.rows != null) inputs['rows'] = node.rows;
      break;
    case 'select':
      // formodel labels select options `description`; the control wants `label`.
      inputs['options'] = node.options.map((o) => ({ value: o.value, label: o.description }));
      break;
    case 'radio':
      inputs['options'] = node.options.map((o) => ({ value: o.value, label: o.label }));
      break;
  }

  return inputs;
}
