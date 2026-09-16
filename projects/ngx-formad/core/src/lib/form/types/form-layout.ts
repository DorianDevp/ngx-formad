import { ContentChild } from '../../content';
import { GridLayout, GridPlacement } from '../../layout';
import { ComponentConfig, FieldComponentConfig } from './component-config';
import { FormContext } from './form-context';

/** Discriminates the entries of a layout overlay. */
export enum FormLayoutItemKind {
  Component = 'component',
  Field = 'field',
  Control = 'control',
  Content = 'content',
  Row = 'row',
}

/** A field placed by its model key. */
export interface FormFieldItem<M extends Record<string, unknown> = Record<string, unknown>> {
  readonly kind: FormLayoutItemKind.Field;
  readonly key: string;
  readonly item?: GridPlacement;
}

/** A field drawn by a chosen control. */
export interface FormControlItem<M extends Record<string, unknown> = Record<string, unknown>> {
  readonly kind: FormLayoutItemKind.Control;
  readonly key: string;
  readonly control: FieldComponentConfig<any, object>;
}

/** A component of your own placed between the fields. */
export interface FormComponentItem<M extends Record<string, unknown> = Record<string, unknown>> {
  readonly kind: FormLayoutItemKind.Component;
  readonly config: ComponentConfig<M>;
}

/** A content block with its gate and placement. */
export interface FormContentSpec<M extends Record<string, unknown> = Record<string, unknown>> {
  readonly kind: FormLayoutItemKind.Content;
  readonly children: readonly ContentChild[];
  visibleWhen?(ctx: FormContext<M>): boolean;
  readonly item?: GridPlacement;
}

/** A nested row of items with its own grid. */
export interface FormRowItem<M extends Record<string, unknown> = Record<string, unknown>> {
  readonly kind: FormLayoutItemKind.Row;
  readonly grid?: GridLayout;
  readonly item?: GridPlacement;
  readonly children: readonly FormLayoutItem<M>[];
}

/** One entry of a layout overlay. */
export type FormLayoutItem<M extends Record<string, unknown> = Record<string, unknown>> =
  | FormFieldItem<M>
  | FormControlItem<M>
  | FormContentSpec<M>
  | FormRowItem<M>
  | FormComponentItem<M>;

/** A form's layout overlay: the container grid and the ordered items; built with `formLayout()`. `P` names the components `control()` placed, by field. */
export interface FormLayout<M extends Record<string, unknown> = Record<string, unknown>, P extends {} = {}> {
  readonly __placed?: P;
  readonly grid?: GridLayout;
  readonly items: readonly FormLayoutItem<M>[];
  /** The fields left out on purpose; the dev-mode warning about unplaced fields skips them. */
  readonly omitted?: readonly string[];
}

/** Placement of a content block: its grid span and a gate read from the layout context. */
export interface FormContentCfg<M extends Record<string, unknown>> extends GridPlacement {
  visibleWhen?(ctx: FormContext<M>): boolean;
}

/** A row's own grid plus its placement in the parent grid. */
export interface FormRowCfg extends GridLayout, GridPlacement {}
