import { Type } from '@angular/core';
import { FieldTree, SchemaOrSchemaFn } from '@angular/forms/signals';
import {
  RepeatingGroupNode,
  SelectFormControlNode,
  UiFormControlNode,
  UiFormGroupConfig,
  UiFormGroupNode,
} from 'formodel';
import { ItemSpec, LayoutSpec } from '../layout/layout-adapter';
import { SharedState } from '../sync/shared-state';

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

/** What a layout component's input getters (and `visibleWhen`) read: the live model
 *  value, the live field tree (per-field errors/touched, not just values), and — when
 *  the form runs inside a stepper page — the cross-step shared store (`null` for a
 *  standalone form). Given to `FormComponentSpec.inputs` so a component can be bound
 *  from any of them. */
export interface FormComponentContext<M extends Record<string, unknown> = Record<string, unknown>> {
  readonly model: M;
  readonly form: FieldTree<M>;
  readonly shared: SharedState<Record<string, unknown>> | null;
}

/** Authoring config for a component dropped into the field flow (from
 *  `formLayout(...).component(...)`): its inputs/outputs written as functions of the
 *  live {@link FormComponentContext}, so they stay reactive as fields change, plus
 *  optional visibility and its own grid placement. `kind:'component'` discriminates
 *  it from a field key in a layout. */
export interface FormComponentSpec<M extends Record<string, unknown> = Record<string, unknown>> {
  readonly kind: 'component';
  readonly component: Type<unknown>;
  readonly inputs?: Readonly<Record<string, (ctx: FormComponentContext<M>) => unknown>>;
  readonly outputs?: Readonly<Record<string, (event: never) => void>>;
  readonly visibleWhen?: (ctx: FormComponentContext<M>) => boolean;
  /** How this component sits in the parent grid (`colSpan`/`colStart`). */
  readonly item?: ItemSpec;
}

/** A component sitting between fields in the render tree — the flat-form counterpart
 *  of a page's `ComponentNode`, but with context-reactive inputs the renderer binds
 *  against the live form (the page variant pre-normalizes bindings at build time). */
export interface FormComponentNode {
  readonly kind: 'component';
  readonly key: string;
  readonly path: readonly string[];
  readonly component: Type<unknown>;
  readonly inputs: Readonly<Record<string, (ctx: FormComponentContext) => unknown>>;
  readonly outputs: Readonly<Record<string, (event: never) => void>>;
  readonly visibleWhen?: (ctx: FormComponentContext) => boolean;
  readonly layout?: ItemSpec;
}

/** A pure-layout row: its own sub-grid (`layout`) over a set of children, placed in
 *  the parent grid via `layout`(item). Children still reference the same field tree
 *  level — a row groups for layout only, it is not a model nesting. */
export interface FormRowNode {
  readonly kind: 'row';
  readonly key: string;
  readonly path: readonly string[];
  /** The row's own container grid. */
  readonly grid: LayoutSpec;
  /** How the row itself sits in the parent grid. */
  readonly layout?: ItemSpec;
  readonly children: readonly RenderNode[];
}

/** Anything the renderer can draw at one level of the tree. */
export type RenderNode = ControlNode | GroupNode | ArrayNode | FormComponentNode | FormRowNode;

/** One entry of a form's layout overlay: a field (by model key, with optional grid
 *  placement), a component, or a nested row of further items. */
export type FormLayoutItem<M extends Record<string, unknown>> =
  | { readonly kind: 'field'; readonly key: keyof M & string; readonly item?: ItemSpec }
  | FormComponentSpec<M>
  | {
      readonly kind: 'row';
      readonly grid?: LayoutSpec;
      readonly item?: ItemSpec;
      readonly children: readonly FormLayoutItem<M>[];
    };

/** The render-order overlay for a form: the container grid plus the ordered items
 *  (fields, components, rows). Built with `formLayout(ui)`; set on `FormConfig.layout`.
 *  Field-building in `ui` is untouched — this only decides order, placement, and where
 *  components sit. */
export interface FormLayout<M extends Record<string, unknown>> {
  readonly grid?: LayoutSpec;
  readonly items: readonly FormLayoutItem<M>[];
}

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
  /** Optional render-order overlay: arranges the `ui` fields in a responsive grid and
   *  drops components between them. When present the renderer walks THIS; fields left
   *  out still validate (they are in the schema) but do not render — list every field
   *  you want shown. Build it with `formLayout(ui)`. */
  readonly layout?: FormLayout<M>;
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
// A component spec is the only layout item / UI value carrying `kind: 'component'`;
// field nodes discriminate on `type`, groups on `controlsConfig`.
function isComponentSpec(item: unknown): item is FormComponentSpec {
  return !!item && typeof item === 'object' && (item as { kind?: string }).kind === 'component';
}

// Builds one field's render node from its formodel config value: object → group,
// `type:'array'` → array, else a scalar control. The single place a formodel node
// becomes a render node, reused by the declared-order and layout-overlay walks.
function buildFieldNode(
  key: string,
  node: unknown,
  here: readonly string[],
  layout?: ItemSpec,
): RenderNode {
  if (isGroupNode(node)) {
    return {
      kind: 'group',
      key,
      path: here,
      label: node.label,
      maxCols: node.maxCols,
      children: buildNodes(node.controlsConfig as UiFormGroupConfig<Record<string, unknown>>, here),
      layout,
    };
  }
  if (isArrayNode(node)) {
    return {
      kind: 'array',
      key,
      path: here,
      node,
      item: buildNodes(node.itemConfig as UiFormGroupConfig<Record<string, unknown>>, here),
      layout,
    };
  }
  return { kind: 'control', key, path: here, node: node as UiFormControlNode, layout };
}

/**
 * Builds the recursive render tree from a formodel config in DECLARED order: scalars
 * become control nodes, objects become group nodes (descending into `controlsConfig`),
 * arrays become array nodes (descending into `itemConfig`). Each node carries its full
 * path from the root so consumers can address the matching nested field tree.
 */
export function buildNodes(
  ui: UiFormGroupConfig<Record<string, unknown>>,
  path: readonly string[] = [],
): RenderNode[] {
  return Object.entries(ui as Record<string, unknown>).map(([key, node]) =>
    buildFieldNode(key, node, [...path, key]),
  );
}

/**
 * Builds the render tree from a layout overlay: walks the overlay's items in order,
 * resolving each field key against `ui`, lifting each component spec to a component
 * node, and recursing into rows (which reuse the same field-tree level — a row is
 * layout only). Components/rows get synthetic keys so `@for` tracking stays stable.
 */
export function buildLayoutNodes(
  ui: UiFormGroupConfig<Record<string, unknown>>,
  items: readonly FormLayoutItem<Record<string, unknown>>[],
  path: readonly string[] = [],
): RenderNode[] {
  const nodes: RenderNode[] = [];
  let synthetic = 0;
  for (const item of items) {
    if (isComponentSpec(item)) {
      const key = `@component:${synthetic++}`;
      nodes.push({
        kind: 'component',
        key,
        path: [...path, key],
        component: item.component,
        inputs: item.inputs ?? {},
        outputs: item.outputs ?? {},
        visibleWhen: item.visibleWhen,
        layout: item.item,
      });
    } else if (item.kind === 'row') {
      const key = `@row:${synthetic++}`;
      nodes.push({
        kind: 'row',
        key,
        path: [...path, key],
        grid: item.grid ?? {},
        layout: item.item,
        children: buildLayoutNodes(ui, item.children, path),
      });
    } else {
      const node = (ui as Record<string, unknown>)[item.key];
      if (node) nodes.push(buildFieldNode(item.key, node, [...path, item.key], item.item));
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
