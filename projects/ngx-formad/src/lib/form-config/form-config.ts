import { SchemaOrSchemaFn } from '@angular/forms/signals';
import {
  RepeatingGroupNode,
  SelectFormControlNode,
  UiFormControlNode,
  UiFormGroupConfig,
  UiFormGroupNode,
} from 'formodel';
import { ItemSpec } from '../layout/layout-adapter';

/** One option of a `select` / `radio` / `multiselect` field — `{ value, description }`,
 *  exactly what formodel's `select(label, options)` takes. Exported so app code can
 *  type its option lists by name instead of re-declaring the shape. */
export type SelectOption = SelectFormControlNode['options'][number];

// form-config is the render description, not a rival to native `form()`. formodel
// already turns a model into a typed config of nodes (kind + label + options, and
// for objects/arrays a nested controlsConfig/itemConfig); this layer adapts that
// config into a tree the renderer can walk recursively. Validation and field state
// stay entirely native — nesting included, since `form(model)` already produces a
// nested `FieldTree` (`root.location.city`) and folds validity over the whole tree.

/** One scalar field ready to render: the model key, its formodel node, a layout
 *  hint, and the full path from the form root (`['location','city']`). */
export interface FieldConfig {
  /** The key of this field within its immediate group. */
  readonly key: string;
  /** The path from the form root to this field; `[key]` at the top level. */
  readonly path: readonly string[];
  /** The formodel node — `type` is the control kind, plus label/options/etc. */
  readonly node: UiFormControlNode;
  /** Optional per-field layout, applied by the layout adapter's `item()`. */
  readonly layout?: ItemSpec;
}

/** A scalar control in the render tree. */
export interface ControlNode extends FieldConfig {
  readonly kind: 'control';
}

/** A nested group (a model object): its own label, column count, and children. */
export interface GroupNode {
  readonly kind: 'group';
  readonly key: string;
  readonly path: readonly string[];
  readonly label: string;
  readonly maxCols: number;
  readonly children: readonly RenderNode[];
  readonly layout?: ItemSpec;
}

/** A repeating group (a model array): the array node plus the render tree for one
 *  item. The renderer draws each item from `item` with Add/Remove controls (see
 *  `NodesView`), bound to that item's field tree. */
export interface ArrayNode {
  readonly kind: 'array';
  readonly key: string;
  readonly path: readonly string[];
  readonly node: RepeatingGroupNode<unknown>;
  readonly item: readonly RenderNode[];
  readonly layout?: ItemSpec;
}

/** Anything the renderer can draw at one level of the tree. */
export type RenderNode = ControlNode | GroupNode | ArrayNode;

/**
 * One form as renderable data: a factory for a fresh model (so the same form
 * reused in two steps stays two independent instances), the formodel UI config
 * that drives rendering, and an optional native schema that owns validation.
 *
 * Declare the model `M` as a `type` alias, not an `interface`: the `Record<string,
 * unknown>` bound is satisfied by an object **type** (which gets an implicit index
 * signature) but not by an `interface` (which doesn't), so an interface model is
 * rejected with a "not assignable to Record<string, unknown>" error.
 */
export interface FormConfig<M extends Record<string, unknown>> {
  readonly model: () => M;
  readonly ui: UiFormGroupConfig<M>;
  readonly schema?: SchemaOrSchemaFn<M>;
}

// A group node carries `controlsConfig`; a repeating array carries `type: 'array'`
// + `itemConfig`. A plain control (incl. select/file, even for array-typed model
// keys) has neither marker, so it falls through to the scalar case.
function isGroupNode(node: unknown): node is UiFormGroupNode<Record<string, unknown>> {
  return !!node && typeof node === 'object' && 'controlsConfig' in node;
}
function isArrayNode(node: unknown): node is RepeatingGroupNode<unknown> {
  return (
    !!node &&
    typeof node === 'object' &&
    (node as { type?: string }).type === 'array' &&
    'itemConfig' in node
  );
}

/**
 * Builds the recursive render tree from a formodel config: scalars become control
 * nodes, objects become group nodes (descending into `controlsConfig`), arrays
 * become array nodes (descending into `itemConfig`). Each node carries its full
 * path from the root so consumers can address the matching nested field tree.
 */
export function buildNodes(
  ui: UiFormGroupConfig<Record<string, unknown>>,
  path: readonly string[] = [],
): RenderNode[] {
  const nodes: RenderNode[] = [];
  for (const [key, node] of Object.entries(ui as Record<string, unknown>)) {
    const here = [...path, key];
    if (isGroupNode(node)) {
      nodes.push({
        kind: 'group',
        key,
        path: here,
        label: node.label,
        maxCols: node.maxCols,
        children: buildNodes(node.controlsConfig as UiFormGroupConfig<Record<string, unknown>>, here),
      });
    } else if (isArrayNode(node)) {
      nodes.push({
        kind: 'array',
        key,
        path: here,
        node,
        item: buildNodes(node.itemConfig as UiFormGroupConfig<Record<string, unknown>>, here),
      });
    } else {
      nodes.push({ kind: 'control', key, path: here, node: node as UiFormControlNode });
    }
  }
  return nodes;
}

/**
 * Flattens the render tree to its scalar leaves (depth-first), each with its full
 * path. The renderer descends structurally; this list is for consumers that fold
 * over every field — a validation summary, a "mark all touched" pass — and want to
 * address each leaf by path. Array contents are excluded (their length is dynamic).
 */
export function flattenFields(ui: UiFormGroupConfig<Record<string, unknown>>): FieldConfig[] {
  const leaves: FieldConfig[] = [];
  const walk = (nodes: readonly RenderNode[]) => {
    for (const node of nodes) {
      if (node.kind === 'control') leaves.push(node);
      else if (node.kind === 'group') walk(node.children);
    }
  };
  walk(buildNodes(ui));
  return leaves;
}

/**
 * The non-contract inputs a control needs beyond the field binding. `FormField`
 * supplies value/errors/disabled/touched/required from the field; this fills in
 * the purely presentational extras the node carries — label, input type, select
 * options — which the renderer feeds as plain input bindings.
 */
export function extraInputsFor(node: UiFormControlNode): Record<string, unknown> {
  // A custom-kind node (from `customInputType`) hands the control exactly one
  // presentational input — its typed `props` bag. We forward nothing else (a
  // custom control declares no `label`/`type`/… inputs, so binding them would
  // throw); anything it needs, including a label, lives in `props`.
  const props = (node as { props?: unknown }).props;
  if (props !== undefined) return { props };

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
    case 'date':
      // Forward the optional bounds; the date control clamps the native picker.
      // (`minDate`/`maxDate`, since `min`/`max` are reserved control inputs.)
      if (node.limit) {
        inputs['minDate'] = node.limit.min;
        inputs['maxDate'] = node.limit.max;
      }
      break;
    case 'file':
      if (node.accept) inputs['accept'] = node.accept;
      if (node.multiple != null) inputs['multiple'] = node.multiple;
      if (node.maxFiles != null) inputs['maxFiles'] = node.maxFiles;
      break;
    case 'checkbox':
      // A consent-style checkbox renders rich prose from the node's `innerHTML`.
      if (node.innerHTML) inputs['innerHTML'] = node.innerHTML;
      break;
  }

  return inputs;
}
