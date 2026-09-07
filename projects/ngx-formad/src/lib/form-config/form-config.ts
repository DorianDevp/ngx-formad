import { computed, Type } from '@angular/core';
import { SchemaPathTree } from '@angular/forms/signals';
import {
  CUSTOM_FIELD,
  RepeatingGroupNode,
  SelectFormControlNode,
  UiFormControlNode,
  UiFormGroupConfig,
  UiFormGroupNode,
} from 'formodel';
import { ContentChild } from '../builders/content';
import { ItemSpec, LayoutSpec } from '../layout/layout-adapter';
import { SharedState } from '../sync/shared-state';
import { Live, read } from './live';

/** One option of a `select`/`multiselect` field, as formodel declares it. */
export type SelectOption = SelectFormControlNode['options'][number];

/** An option as the select and radio controls consume it. */
export interface ControlOption {
  readonly value: SelectOption['value'];

  readonly label: string;
}

/** A group node as the structural walk sees it: label, columns and erased children. */
export interface ErasedGroupNode {
  readonly label: string;

  readonly maxCols: number;

  readonly controlsConfig: ErasedUi;
}

/** A repeating group as the structural walk sees it: array options and an erased item config. */
export interface ErasedArrayNode<TItem extends Record<string, unknown> = Record<string, unknown>>
  extends Omit<RepeatingGroupNode<TItem>, 'itemConfig'> {
  readonly itemConfig: ErasedUi;
}

/** A registered custom control node as the renderer sees it: its kind and its typed props bag. */
export interface CustomKindNode<P extends Record<string, unknown> = Record<string, unknown>> {
  readonly type: string;

  readonly props: Live<P>;
}

/** A formodel control node with every presentational prop accepting a live value; `type` stays plain, optional stays optional. */
export type LiveControlNode<N extends UiFormControlNode = UiFormControlNode> = N extends UiFormControlNode
  ? { [K in keyof N]: K extends 'type' ? N[K] : Live<Exclude<N[K], undefined>> }
  : never;

type LiveUiNode<V> = V extends UiFormGroupNode<infer T>
  ? Omit<V, 'controlsConfig'> & { readonly controlsConfig: LiveUiConfig<T> }
  : V extends RepeatingGroupNode<infer I>
    ? Omit<V, 'itemConfig'> & { readonly itemConfig: LiveUiConfig<I> }
    : V extends { readonly props: infer P extends Record<string, unknown> }
      ? Omit<V, 'props'> & { readonly props: Live<P> }
      : V extends UiFormControlNode
        ? LiveControlNode<V>
        : V;

/** `UiFormGroupConfig<M>` with control props widened to `Live`; every plain formodel config is assignable as it is. */
export type LiveUiConfig<M> = {
  [K in keyof UiFormGroupConfig<M>]: LiveUiNode<UiFormGroupConfig<M>[K]>;
};

/** A scalar field's node: a formodel control node, live props allowed, or a registered custom kind. */
export type FieldNode = LiveControlNode | CustomKindNode;

/** One node of the erased ui: a scalar field, a group or a repeating group. */
export type ErasedUiNode = FieldNode | ErasedGroupNode | ErasedArrayNode;

/** The authored ui viewed by structure: model keys to nodes. */
export type ErasedUi = Readonly<Record<string, ErasedUiNode>>;

/** What a layout gate or control input reads: the live model and, inside a wizard, the shared store. */
export interface FormLayoutContext<M extends Record<string, unknown> = Record<string, unknown>> {
  readonly model: M;

  readonly shared: SharedState | null;
}

/** A control input read from the layout context; a signal fits too, since it ignores the argument. */
export type ContextualInput<V, M extends Record<string, unknown>> = (ctx: FormLayoutContext<M>) => V;

/** A control's presentational input as authored: a value, or a read of the layout context. */
export type ControlInput<V, M extends Record<string, unknown>> = V | ContextualInput<V, M>;

/** Narrows an authored input to a read of the layout context. */
export function isContextual<V, M extends Record<string, unknown>>(input: ControlInput<V, M>): input is ContextualInput<V, M> {
  return typeof input === 'function';
}

/** One control input as a layout item holds it: read against the layout context whenever the outlet binds. */
export interface ControlInputRead<V = unknown, M extends Record<string, unknown> = Record<string, unknown>> {
  read(ctx: FormLayoutContext<M>): V;
}

/** A control placed on a field by `formLayout().control()`: the component and its inputs. */
export interface ControlOverride<M extends Record<string, unknown> = Record<string, unknown>, V = unknown> {
  readonly component: Type<object>;

  readonly inputs: Readonly<Record<string, ControlInputRead<V, M>>>;
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

  readonly control?: ControlOverride;
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

  visibleWhen?(ctx: FormLayoutContext): boolean;

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
export interface FormFieldItem<M extends Record<string, unknown> = Record<string, unknown>> {
  readonly kind: FormLayoutItemKind.Field;

  readonly key: string;

  readonly item?: ItemSpec;
}

/** A field drawn by a chosen control. */
export interface FormControlItem<M extends Record<string, unknown> = Record<string, unknown>> {
  readonly kind: FormLayoutItemKind.Control;

  readonly key: string;

  readonly control: ControlOverride<M>;

  readonly item?: ItemSpec;
}

/** A content block with its gate and placement. */
export interface FormContentSpec<M extends Record<string, unknown> = Record<string, unknown>> {
  readonly kind: FormLayoutItemKind.Content;

  readonly children: readonly ContentChild[];

  visibleWhen?(ctx: FormLayoutContext<M>): boolean;

  readonly item?: ItemSpec;
}

/** A nested row of items with its own grid. */
export interface FormRowItem<M extends Record<string, unknown> = Record<string, unknown>> {
  readonly kind: FormLayoutItemKind.Row;

  readonly grid?: LayoutSpec;

  readonly item?: ItemSpec;

  readonly children: readonly FormLayoutItem<M>[];
}

/** One entry of a layout overlay. */
export type FormLayoutItem<M extends Record<string, unknown> = Record<string, unknown>> =
  | FormFieldItem<M>
  | FormControlItem<M>
  | FormContentSpec<M>
  | FormRowItem<M>;

/** A form's layout overlay: the container grid and the ordered items; built with `formLayout()`. */
export interface FormLayout<M extends Record<string, unknown> = Record<string, unknown>> {
  readonly grid?: LayoutSpec;

  readonly items: readonly FormLayoutItem<M>[];
}

/** A form template as the runtime holds it: a fresh-model factory, the ui by structure, an optional schema and layout overlay. */
export interface RuntimeFormConfig<M extends Record<string, unknown> = Record<string, unknown>> {
  model(): M;

  readonly ui: ErasedUi;

  schema?(p: SchemaPathTree<M>): void;

  readonly layout?: FormLayout<M>;
}

/** One form as authored: the template with its ui type kept, so live props come back as declared. */
export interface FormConfig<
  M extends Record<string, unknown>,
  U extends LiveUiConfig<M> & ErasedUi = LiveUiConfig<M> & ErasedUi,
> extends RuntimeFormConfig<M> {
  readonly ui: U;
}

/** Declares a form config while keeping the authored `ui` type, so a signal put in comes back writable. */
export function defineForm<M extends Record<string, unknown>, U extends LiveUiConfig<M> & ErasedUi>(
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

function contentNode(item: FormContentSpec, slot: LayoutSlot): FormContentNode {
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

function rowNode(item: FormRowItem, slot: LayoutSlot): FormRowNode {
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

function controlNode(item: FormControlItem, slot: LayoutSlot): ControlNode | null {
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

function fieldNode(item: FormFieldItem, slot: LayoutSlot): RenderNode | null {
  const node = slot.ui[item.key];

  return node === undefined
    ? null
    : buildFieldNode(node, { key: item.key, path: [...slot.path, item.key], layout: item.item });
}

function layoutNode(item: FormLayoutItem, slot: LayoutSlot): RenderNode | null {
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

function layoutNodes(items: readonly FormLayoutItem[], walk: LayoutWalk): RenderNode[] {
  return items.flatMap((item, index) => {
    const node = layoutNode(item, { ...walk, index });

    return node === null ? [] : [node];
  });
}

/** Builds the render tree from a layout overlay, resolving field keys against the erased ui. */
export function buildLayoutNodes(ui: ErasedUi, items: readonly FormLayoutItem[]): RenderNode[] {
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
export type ControlInputs<V = unknown> = Readonly<Record<string, Live<V>>>;

type PresentationalNode = Exclude<LiveControlNode, { readonly type: typeof CUSTOM_FIELD }>;

/** The inputs a kind adds; a derived one is a `computed`, so its identity holds until the source moves. */
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
        options: computed((): ControlOption[] =>
          read(node.options).map((option) => ({ value: option.value, label: option.description })),
        ),
      };
    case 'radio':
      return {
        options: computed((): ControlOption[] =>
          read(node.options).map((option) => ({ value: option.value, label: option.label })),
        ),
      };
    case 'date': {
      const limit = node.limit;

      return limit ? { minDate: computed(() => read(limit).min), maxDate: computed(() => read(limit).max) } : {};
    }
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
