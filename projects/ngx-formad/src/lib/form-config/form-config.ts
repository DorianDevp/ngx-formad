import { Type } from '@angular/core';
import { SchemaOrSchemaFn } from '@angular/forms/signals';
import { CUSTOM_FIELD, RepeatingGroupNode, SelectFormControlNode } from 'formodel';
import { ContentChild } from '../builders/content';
import { ErasedRecord, ErasedValue } from '../builders/step-context';
import { ItemSpec, LayoutSpec } from '../layout/layout-adapter';
import { SharedState } from '../sync/shared-state';
import { mapReactive, ReactiveControlNode, ReactiveUiConfig, ReactiveValue } from './reactive';

/** One option of a `select`/`radio`/`multiselect` field, as formodel declares it. */
export type SelectOption = SelectFormControlNode['options'][number];

/** A group node as the structural walk sees it: label, columns and erased children. */
export interface ErasedGroupNode {
  readonly label: string;

  readonly maxCols: number;

  readonly controlsConfig: ErasedUi;
}

/** A repeating group as the structural walk sees it: array options and an erased item config. */
export interface ErasedArrayNode extends Omit<RepeatingGroupNode<ErasedValue>, 'itemConfig'> {
  readonly itemConfig: ErasedUi;
}

/** A registered custom control node as the renderer sees it: its kind and its typed props bag. */
export interface CustomKindNode {
  readonly type: string;

  readonly props: ReactiveValue<ErasedRecord>;
}

/** A scalar field's node: a formodel control node, or a registered custom kind. */
export type FieldNode = ReactiveControlNode | CustomKindNode;

/** One node of the erased ui: a scalar field, a group or a repeating group. */
export type ErasedUiNode = FieldNode | ErasedGroupNode | ErasedArrayNode;

/** The authored ui viewed by structure: model keys to nodes. */
export type ErasedUi = Readonly<Record<string, ErasedUiNode>>;

/** What a layout gate or control input reads: the live model and, inside a wizard, the shared store. */
export interface FormLayoutContext<M extends ErasedRecord = ErasedRecord> {
  readonly model: M;

  readonly shared: SharedState<ErasedRecord> | null;
}

/** A control's presentational input as authored: a value, or a read of the layout context. */
export type ControlInput<V, M extends ErasedRecord> = V | ((ctx: FormLayoutContext<M>) => V);

/** Resolves one authored input against the layout context. */
export function resolveControlInput<M extends ErasedRecord>(
  input: ControlInput<ErasedValue, M>,
  ctx: FormLayoutContext<M>,
): ErasedValue {
  return typeof input === 'function' ? (input as (ctx: FormLayoutContext<M>) => ErasedValue)(ctx) : input;
}

/** A control placed on a field by `formLayout().control()`: the component and its inputs. */
export interface ControlOverride<M extends ErasedRecord> {
  readonly component: Type<object>;

  readonly inputs: Readonly<Record<string, ControlInput<ErasedValue, M>>>;
}

/** Discriminates the nodes of the render tree. */
export enum RenderNodeKind {
  Control = 'control',
  Group = 'group',
  Array = 'array',
  Content = 'content',
  Row = 'row',
}

/** One scalar field ready to render: its key, path from the form root, node, placement and chosen control. */
export interface FieldConfig {
  readonly key: string;

  readonly path: readonly string[];

  readonly node: FieldNode;

  readonly layout?: ItemSpec;

  readonly control?: ControlOverride<ErasedRecord>;
}

/** A scalar control in the render tree. */
export interface ControlNode extends FieldConfig {
  readonly kind: RenderNodeKind.Control;
}

/** A nested group: its label, column count and children. */
export interface GroupNode {
  readonly kind: RenderNodeKind.Group;

  readonly key: string;

  readonly path: readonly string[];

  readonly label: string;

  readonly maxCols: number;

  readonly children: readonly RenderNode[];

  readonly layout?: ItemSpec;
}

/** A repeating group: the array node and the render tree of one item. */
export interface ArrayNode {
  readonly kind: RenderNodeKind.Array;

  readonly key: string;

  readonly path: readonly string[];

  readonly node: ErasedArrayNode;

  readonly item: readonly RenderNode[];

  readonly layout?: ItemSpec;
}

/** A content block between fields, gated on the live form. */
export interface FormContentNode {
  readonly kind: RenderNodeKind.Content;

  readonly key: string;

  readonly path: readonly string[];

  readonly children: readonly ContentChild[];

  readonly visibleWhen?: (ctx: FormLayoutContext) => boolean;

  readonly layout?: ItemSpec;
}

/** A layout-only row: its own grid over children of the same field level. */
export interface FormRowNode {
  readonly kind: RenderNodeKind.Row;

  readonly key: string;

  readonly path: readonly string[];

  readonly grid: LayoutSpec;

  readonly layout?: ItemSpec;

  readonly children: readonly RenderNode[];
}

/** Anything the renderer draws at one level of the tree. */
export type RenderNode = ControlNode | GroupNode | ArrayNode | FormContentNode | FormRowNode;

/** Discriminates the entries of a layout overlay. */
export enum FormLayoutItemKind {
  Field = 'field',
  Control = 'control',
  Content = 'content',
  Row = 'row',
}

/** A field placed by its model key. */
export interface FormFieldItem<M extends ErasedRecord> {
  readonly kind: FormLayoutItemKind.Field;

  readonly key: keyof M & string;

  readonly item?: ItemSpec;
}

/** A field drawn by a chosen control. */
export interface FormControlItem<M extends ErasedRecord> {
  readonly kind: FormLayoutItemKind.Control;

  readonly key: keyof M & string;

  readonly control: ControlOverride<M>;

  readonly item?: ItemSpec;
}

/** A content block with its gate and placement. */
export interface FormContentSpec<M extends ErasedRecord> {
  readonly kind: FormLayoutItemKind.Content;

  readonly children: readonly ContentChild[];

  readonly visibleWhen?: (ctx: FormLayoutContext<M>) => boolean;

  readonly item?: ItemSpec;
}

/** A nested row of items with its own grid. */
export interface FormRowItem<M extends ErasedRecord> {
  readonly kind: FormLayoutItemKind.Row;

  readonly grid?: LayoutSpec;

  readonly item?: ItemSpec;

  readonly children: readonly FormLayoutItem<M>[];
}

/** One entry of a layout overlay. */
export type FormLayoutItem<M extends ErasedRecord> =
  | FormFieldItem<M>
  | FormControlItem<M>
  | FormContentSpec<M>
  | FormRowItem<M>;

/** A form's layout overlay: the container grid and the ordered items; built with `formLayout()`. */
export interface FormLayout<M extends ErasedRecord> {
  readonly grid?: LayoutSpec;

  readonly items: readonly FormLayoutItem<M>[];
}

/** One form as renderable data: a fresh-model factory, the ui config, an optional schema and layout overlay. */
export interface FormConfig<
  M extends ErasedRecord,
  U extends ReactiveUiConfig<M> = ReactiveUiConfig<M>,
> {
  readonly model: () => M;

  readonly ui: U;

  readonly schema?: SchemaOrSchemaFn<M>;

  readonly layout?: FormLayout<M>;
}

/** Declares a form config while keeping the authored `ui` type, so live props come back writable. */
export function defineForm<M extends ErasedRecord, U extends ReactiveUiConfig<M>>(
  config: FormConfig<M, U>,
): FormConfig<M, U> {
  return config;
}

interface FieldSlot {
  readonly key: string;
  readonly path: readonly string[];
  readonly layout?: ItemSpec;
}

function buildFieldNode(node: ErasedUiNode, slot: FieldSlot): RenderNode {
  if ('controlsConfig' in node) {
    return {
      kind: RenderNodeKind.Group,
      ...slot,
      label: node.label,
      maxCols: node.maxCols,
      children: buildNodes(node.controlsConfig, slot.path),
    };
  }
  if ('itemConfig' in node) {
    return { kind: RenderNodeKind.Array, ...slot, node, item: buildNodes(node.itemConfig, slot.path) };
  }

  return { kind: RenderNodeKind.Control, ...slot, node };
}

/** Builds the render tree from an erased ui in declared order; each node carries its full path. */
export function buildNodes(ui: ErasedUi, path: readonly string[] = []): RenderNode[] {
  return Object.entries(ui).map(([key, node]) => buildFieldNode(node, { key, path: [...path, key] }));
}

interface LayoutWalk {
  readonly ui: ErasedUi;
  readonly path: readonly string[];
}

interface LayoutSlot extends LayoutWalk {
  readonly index: number;
}

function contentNode(item: FormContentSpec<ErasedRecord>, slot: LayoutSlot): FormContentNode {
  const key = `@content:${slot.index}`;

  return {
    kind: RenderNodeKind.Content,
    key,
    path: [...slot.path, key],
    children: item.children,
    visibleWhen: item.visibleWhen,
    layout: item.item,
  };
}

function rowNode(item: FormRowItem<ErasedRecord>, slot: LayoutSlot): FormRowNode {
  const key = `@row:${slot.index}`;

  return {
    kind: RenderNodeKind.Row,
    key,
    path: [...slot.path, key],
    grid: item.grid ?? {},
    layout: item.item,
    children: layoutNodes(item.children, slot),
  };
}

function controlNode(item: FormControlItem<ErasedRecord>, slot: LayoutSlot): ControlNode | null {
  const node = slot.ui[item.key];
  if (node === undefined) return null;
  if ('controlsConfig' in node || 'itemConfig' in node) {
    throw new Error(`ngx-formad: control() needs a scalar field; "${item.key}" is a group or an array.`);
  }

  return {
    kind: RenderNodeKind.Control,
    key: item.key,
    path: [...slot.path, item.key],
    node,
    layout: item.item,
    control: item.control,
  };
}

function fieldNode(item: FormFieldItem<ErasedRecord>, slot: LayoutSlot): RenderNode | null {
  const node = slot.ui[item.key];

  return node === undefined
    ? null
    : buildFieldNode(node, { key: item.key, path: [...slot.path, item.key], layout: item.item });
}

function layoutNode(item: FormLayoutItem<ErasedRecord>, slot: LayoutSlot): RenderNode | null {
  switch (item.kind) {
    case FormLayoutItemKind.Content:
      return contentNode(item, slot);
    case FormLayoutItemKind.Row:
      return rowNode(item, slot);
    case FormLayoutItemKind.Control:
      return controlNode(item, slot);
    case FormLayoutItemKind.Field:
      return fieldNode(item, slot);
  }
}

function layoutNodes(items: readonly FormLayoutItem<ErasedRecord>[], walk: LayoutWalk): RenderNode[] {
  return items.flatMap((item, index) => {
    const node = layoutNode(item, { ...walk, index });

    return node === null ? [] : [node];
  });
}

/** Builds the render tree from a layout overlay, resolving field keys against the erased ui. */
export function buildLayoutNodes(ui: ErasedUi, items: readonly FormLayoutItem<ErasedRecord>[]): RenderNode[] {
  return layoutNodes(items, { ui, path: [] });
}

function leavesOf(nodes: readonly RenderNode[]): FieldConfig[] {
  return nodes.flatMap((node) => {
    if (node.kind === RenderNodeKind.Control) return [node];

    return node.kind === RenderNodeKind.Group ? leavesOf(node.children) : [];
  });
}

/** Flattens the declared ui to its scalar leaves, depth first; array contents are excluded. */
export function flattenFields(ui: ErasedUi): FieldConfig[] {
  return leavesOf(buildNodes(ui));
}

/** The presentational inputs a control receives beyond the field binding, each possibly live. */
export type ControlInputs = Readonly<Record<string, ReactiveValue<ErasedValue>>>;

type PresentationalNode = Exclude<ReactiveControlNode, { readonly type: typeof CUSTOM_FIELD }>;

function kindInputs(node: PresentationalNode): ControlInputs {
  switch (node.type) {
    case 'text':
    case 'email':
    case 'password':
    case 'tel':
    case 'url':
      return { type: node.type };
    case 'textarea':
      return node.rows != null ? { rows: node.rows } : {};
    case 'select':
      return {
        options: mapReactive(node.options, (options) =>
          options.map((option) => ({ value: option.value, label: option.description })),
        ),
      };
    case 'radio':
      return {
        options: mapReactive(node.options, (options) =>
          options.map((option) => ({ value: option.value, label: option.label })),
        ),
      };
    case 'date':
      return node.limit
        ? {
            minDate: mapReactive(node.limit, (limit) => limit?.min ?? null),
            maxDate: mapReactive(node.limit, (limit) => limit?.max ?? null),
          }
        : {};
    case 'file':
      return {
        ...(node.accept ? { accept: node.accept } : {}),
        ...(node.multiple != null ? { multiple: node.multiple } : {}),
        ...(node.maxFiles != null ? { maxFiles: node.maxFiles } : {}),
      };
    case 'checkbox':
      return node.innerHTML ? { innerHTML: node.innerHTML } : {};
    default:
      return {};
  }
}

/** The inputs a control receives beyond the field binding: a custom node's `props`, or the node's presentational props. */
export function extraInputsFor(node: FieldNode): ControlInputs {
  if ('props' in node) return { props: node.props };
  if (node.type === CUSTOM_FIELD) return {};

  return {
    ...(node.label != null ? { label: node.label } : {}),
    ...(node.placeholder ? { placeholder: node.placeholder } : {}),
    ...kindInputs(node),
  };
}
