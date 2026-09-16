import { ContentChild } from '../../content';
import { GridLayout, GridPlacement } from '../../layout';
import { FieldConfig, FormContext } from './form-context';
import { ErasedArrayNode } from './ui-nodes';

/** Discriminates the nodes of the render tree. */
export enum RenderNodeKind {
  Component = 'component',
  Control = 'control',
  Group = 'group',
  Array = 'array',
  Content = 'content',
  Row = 'row',
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

  readonly layout?: GridPlacement;
}

/** A repeating group: the array node and the render tree of one item. */
export interface ArrayNode {
  readonly kind: RenderNodeKind.Array;

  readonly key: string;

  readonly path: readonly string[];

  readonly node: ErasedArrayNode;

  readonly item: readonly RenderNode[];

  readonly layout?: GridPlacement;
}

/** A content block between fields, gated on the live form. */
export interface FormContentNode {
  readonly kind: RenderNodeKind.Content;

  readonly key: string;

  readonly path: readonly string[];

  readonly children: readonly ContentChild[];

  visibleWhen?(ctx: FormContext): boolean;

  readonly layout?: GridPlacement;
}

/** A layout-only row: its own grid over children of the same field level. */
export interface FormRowNode {
  readonly kind: RenderNodeKind.Row;
  readonly key: string;
  readonly path: readonly string[];
  readonly grid: GridLayout;
  readonly layout?: GridPlacement;
  readonly children: readonly RenderNode[];
}

/** Anything the renderer draws at one level of the tree. */
export type RenderNode = ControlNode | GroupNode | ArrayNode | FormContentNode | FormRowNode;
