import { Binding, DirectiveWithBindings, EnvironmentInjector, Injector, Signal, Type, WritableSignal } from '@angular/core';
import { ControlAdapter } from '../../controls';
import { LayoutAdapter, LayoutClasses } from '../../layout';
import { FieldLevel } from './field-tree';
import { BindingRecord } from './form-bindings';
import { FormContext } from './form-context';
import { ArrayNode, ControlNode, FormContentNode, FormRowNode, GroupNode, RenderNodeKind } from './render-tree';

/** What a form's view is built against, captured once where the form is instantiated; `context` feeds the content gates. */
export interface ViewScope {
  /** The element injector the formFields resolve through: the host's, or the stepper's. */
  readonly injector: Injector;

  readonly environment: EnvironmentInjector;

  readonly controls: ControlAdapter;

  readonly layout: LayoutAdapter;

  readonly context: FormContext;

  readonly model: WritableSignal<Record<string, unknown>>;

  /** What the host declared for the fields, by field path. */
  readonly bindings: BindingRecord;

  /** What an output handler receives beside the payload, read again on every emission. */
  readonly handlerContext: () => FormContext;
}

/** One level of a form's view: its grid and the rows worth drawing right now. */
export interface FormLevel {
  readonly container: LayoutClasses;

  readonly rows: Signal<readonly ViewRow[]>;
}

/** A formField's row; `injector` hands the mount point what to create. */
export interface ControlRow {
  readonly kind: RenderNodeKind.Control;

  readonly node: ControlNode;

  readonly injector: Injector;
}

/** A nested group with its own level. */
export interface GroupRow {
  readonly kind: RenderNodeKind.Group;

  readonly node: GroupNode;

  readonly level: FormLevel;

  readonly item: LayoutClasses;
}

/** A layout row: its own grid over the same field level. */
export interface LayoutRow {
  readonly kind: RenderNodeKind.Row;

  readonly node: FormRowNode;

  readonly level: FormLevel;

  readonly item: LayoutClasses;
}

/** A content block. */
export interface ContentRow {
  readonly kind: RenderNodeKind.Content;

  readonly node: FormContentNode;

  readonly item: LayoutClasses;
}

/** One item of a repeating group: its field tree and its level. */
export interface ArrayItem {
  readonly tree: FieldLevel;

  readonly level: FormLevel;
}

/** A repeating group; `items` follows the field's value, `add` and `remove` write to it. */
export interface ArrayRow {
  readonly kind: RenderNodeKind.Array;

  readonly node: ArrayNode;

  readonly items: Signal<readonly ArrayItem[]>;

  readonly item: LayoutClasses;

  add(): void;

  remove(index: number): void;
}

/** Anything a level draws. */
export type ViewRow = ControlRow | GroupRow | ArrayRow | ContentRow | LayoutRow;

/** What a mount point creates: the component, the directives on its host with their bindings, its own bindings, its environment. */
export interface ComponentMount {
  readonly component: Type<object>;

  readonly directives: readonly DirectiveWithBindings<unknown>[];

  readonly bindings: readonly Binding[];

  readonly environment: EnvironmentInjector;
}

/** The presentational inputs a control receives beyond the field binding: signals, so the mount binds them as they are. */
export type ControlInputs<V = unknown> = Readonly<Record<string, Signal<V>>>;
