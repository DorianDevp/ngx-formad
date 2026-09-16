import { GridPlacement } from '../layout';
import { FieldConfig } from './types/form-context';
import {
  FormComponentItem,
  FormContentSpec,
  FormControlItem,
  FormFieldItem,
  FormLayoutItem,
  FormLayoutItemKind,
  FormRowItem,
} from './types/form-layout';
import {
  ControlNode,
  FormComponentNode,
  FormContentNode,
  FormRowNode,
  RenderNode,
  RenderNodeKind,
} from './types/render-tree';
import { ErasedUi, ErasedUiNode } from './types/ui-nodes';

interface FieldSlot {
  readonly key: string;
  readonly path: readonly string[];
  readonly layout?: GridPlacement;
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

interface LayoutSlot {
  readonly ui: ErasedUi;
  readonly path: readonly string[];
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
    children: buildLayoutNodes(slot.ui, item.children, slot.path),
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
    layout: item.control.placement,
    control: item.control,
  };
}

function componentNode(item: FormComponentItem, slot: LayoutSlot): FormComponentNode {
  const key = `@component:${slot.index}`;

  return {
    kind: RenderNodeKind.Component,
    key,
    path: [...slot.path, key],
    config: item.config,
    layout: item.config.placement,
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
    case FormLayoutItemKind.Component:
      return componentNode(item, slot);
  }
}

/** Builds the render tree from a layout overlay, resolving field keys against the erased ui; a row recurses with its own path. */
export function buildLayoutNodes(ui: ErasedUi, items: readonly FormLayoutItem[], path: readonly string[] = []): RenderNode[] {
  return items.flatMap((item, index) => {
    const node = layoutNode(item, { ui, path, index });

    return node === null ? [] : [node];
  });
}

/** Flattens the declared ui to its scalar leaves, depth first; array contents are excluded. */
export function flattenFields(ui: ErasedUi): FieldConfig[] {
  const leaves = (nodes: readonly RenderNode[]): FieldConfig[] =>
    nodes.flatMap((node) => {
      if (node.kind === RenderNodeKind.Control) return [node];

      return node.kind === RenderNodeKind.Group ? leaves(node.children) : [];
    });

  return leaves(buildNodes(ui));
}
