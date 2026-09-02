import { Type } from '@angular/core';
import { SchemaOrSchemaFn } from '@angular/forms/signals';
import {
  CUSTOM_FIELD,
  RepeatingGroupNode,
  SelectFormControlNode,
  UiFormGroupConfig,
  UiFormGroupNode,
} from 'formodel';
import { ContentChild } from '../builders/content';
import { ItemSpec, LayoutSpec } from '../layout/layout-adapter';
import { SharedState } from '../sync/shared-state';
import { mapReactive, ReactiveControlNode, ReactiveUiConfig } from './reactive';

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
  /** The formodel node — `type` is the control kind, plus label/options/etc.
   *  Presentational props may be signals (see `ReactiveValue`); read them through
   *  `readReactive` rather than directly. */
  readonly node: ReactiveControlNode;
  /** Optional per-field layout, applied by the layout adapter's `item()`. */
  readonly layout?: ItemSpec;
  readonly control?: ControlOverride;
}

export type ControlInput<V = unknown, M extends Record<string, unknown> = Record<string, unknown>> =
  | V
  | ((ctx: FormLayoutContext<M>) => V);

export interface ControlOverride {
  readonly component: Type<unknown>;

  readonly inputs: Readonly<Record<string, ControlInput>>;
}

export function resolveControlInput(input: ControlInput, ctx: FormLayoutContext): unknown {
  return typeof input === 'function' ? (input as (ctx: FormLayoutContext) => unknown)(ctx) : input;
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

export interface FormLayoutContext<M extends Record<string, unknown> = Record<string, unknown>> {
  readonly model: M;

  readonly shared: SharedState<Record<string, unknown>> | null;
}

/** Authoring config for prose between the fields (from `formLayout(...).content(...)`):
 *  the tag tree, an optional gate reading the live form, and its own grid placement.
 *  Same builder as a page's `addContent` - a group heading or a hint is data whether
 *  it sits around a form or inside one. */
export interface FormContentSpec<M extends Record<string, unknown> = Record<string, unknown>> {
  readonly kind: 'content';
  readonly children: readonly ContentChild[];
  readonly visibleWhen?: (ctx: FormLayoutContext<M>) => boolean;
  /** How this block sits in the parent grid (`colSpan`/`colStart`). */
  readonly item?: ItemSpec;
}

/** A content block sitting between fields in the render tree - the flat-form
 *  counterpart of a page's `ContentNode`. */
export interface FormContentNode {
  readonly kind: 'content';
  readonly key: string;
  readonly path: readonly string[];
  readonly children: readonly ContentChild[];
  readonly visibleWhen?: (ctx: FormLayoutContext) => boolean;
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
export type RenderNode =
  | ControlNode
  | GroupNode
  | ArrayNode
  | FormContentNode
  | FormRowNode;

/** One entry of a form's layout overlay: a field (by model key, with optional grid
 *  placement), a component, a content block, or a nested row of further items. */
export type FormLayoutItem<M extends Record<string, unknown>> =
  | { readonly kind: 'field'; readonly key: keyof M & string; readonly item?: ItemSpec }
  | {
      readonly kind: 'control';
      readonly key: keyof M & string;
      readonly control: ControlOverride;
      readonly item?: ItemSpec;
    }
  | FormContentSpec<M>
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
export interface FormConfig<
  M extends Record<string, unknown>,
  U extends ReactiveUiConfig<M> = ReactiveUiConfig<M>,
> {
  readonly model: () => M;
  /** The formodel UI config, with presentational props widened to also accept a
   *  signal — `options: myOptionsSignal` renders live, so a select can be seeded
   *  (and re-seeded) after the form is instantiated. Plain configs, including
   *  everything `UiFormConfigBuilder` produces, are assignable unchanged; to pass
   *  a signal *through* the builder's helpers, wrap it in `reactive(...)`.
   *
   *  The `U` parameter carries the *authored* type through to `FormState.ui`, so
   *  a config declared with `defineForm` (or `satisfies FormConfig<M>`) hands back
   *  your writable signals exactly as you typed them — `state.ui.country.options
   *  .set(...)` seeds the live select with no cast. An explicit `FormConfig<M>`
   *  annotation erases `U` to the widened default (readable, not writable). */
  readonly ui: U;
  readonly schema?: SchemaOrSchemaFn<M>;
  /** Optional render-order overlay: arranges the `ui` fields in a responsive grid and
   *  drops components between them. When present the renderer walks THIS; fields left
   *  out still validate (they are in the schema) but do not render — list every field
   *  you want shown. Build it with `formLayout(ui)`. */
  readonly layout?: FormLayout<M>;
}

/**
 * Declares a form config while *keeping* the authored `ui` type. A plain
 * `const cfg: FormConfig<M> = {...}` annotation widens `ui` to the reactive
 * default, so signals you put in come back as maybe-values; this identity helper
 * checks the config the same way but lets `U` infer, so `instantiateForm(cfg)`
 * returns a `FormState` whose `.ui` still has your `WritableSignal`s writable.
 * (`satisfies FormConfig<M>` achieves the same; this reads better inline.)
 */
export function defineForm<M extends Record<string, unknown>, U extends ReactiveUiConfig<M>>(
  config: FormConfig<M, U>,
): FormConfig<M, U> {
  return config;
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
  return { kind: 'control', key, path: here, node: node as ReactiveControlNode, layout };
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
    if (item.kind === 'content') {
      const key = `@content:${synthetic++}`;
      nodes.push({
        kind: 'content',
        key,
        path: [...path, key],
        children: item.children,
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
    } else if (item.kind === 'control') {
      const node = (ui as Record<string, unknown>)[item.key];
      if (node) {
        nodes.push({
          kind: 'control',
          key: item.key,
          path: [...path, item.key],
          node: node as ReactiveControlNode,
          layout: item.item,
          control: item.control,
        });
      }
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
 * options — which the renderer feeds as input bindings.
 *
 * A prop authored as a signal stays a signal in the result (derived props — the
 * option mapping, the date bounds — become `computed`s, so identity is stable
 * between emissions). The renderer binds every entry through `readReactive`, which
 * is what keeps a live prop live: set the options signal after instantiation and
 * the rendered select follows.
 */
export function extraInputsFor(node: ReactiveControlNode): Record<string, unknown> {
  // A custom-kind node (from `customInputType`) hands the control exactly one
  // presentational input — its typed `props` bag. We forward nothing else (a
  // custom control declares no `label`/`type`/… inputs, so binding them would
  // throw); anything it needs, including a label, lives in `props` — which may
  // itself be a signal, unwrapped like any other entry.
  const props = (node as { props?: unknown }).props;
  if (props !== undefined) return { props };
  if (node.type === CUSTOM_FIELD) return {};

  const inputs: Record<string, unknown> = {};

  // Presence checks read the *prop*, not its value: a signal-backed prop is
  // always bound (its current value may legitimately be empty), a static empty
  // one is skipped as before.
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
      inputs['options'] = mapReactive(node.options, (options) =>
        options.map((o) => ({ value: o.value, label: o.description })),
      );
      break;
    case 'radio':
      inputs['options'] = mapReactive(node.options, (options) =>
        options.map((o) => ({ value: o.value, label: o.label })),
      );
      break;
    case 'date':
      // Forward the optional bounds; the date control clamps the native picker.
      // (`minDate`/`maxDate`, since `min`/`max` are reserved control inputs.)
      if (node.limit) {
        inputs['minDate'] = mapReactive(node.limit, (limit) => limit?.min ?? null);
        inputs['maxDate'] = mapReactive(node.limit, (limit) => limit?.max ?? null);
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
