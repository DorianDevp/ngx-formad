import {
  Binding,
  computed,
  EnvironmentInjector,
  Injector,
  inputBinding,
  linkedSignal,
  outputBinding,
  Signal,
  Type,
  WritableSignal,
} from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { CUSTOM_FIELD } from 'formodel';
import { ControlAdapter } from '../controls/control-adapter';
import { BindingRecord, bindingsAt, FormContext } from '../form-config/form-bindings';
import {
  ArrayNode,
  ControlNode,
  extraInputsFor,
  FieldNode,
  FormContentNode,
  FormLayoutContext,
  FormRowNode,
  GroupNode,
  RenderNode,
  RenderNodeKind,
} from '../form-config/form-config';
import { read } from '../form-config/live';
import { GridLayout, GridPlacement, LayoutAdapter, LayoutClasses } from '../layout/layout-adapter';
import { LayoutItem } from '../layout/layout-item';
import { FieldItems, FieldLeaf, FieldLevel, isItems, isLevel } from './field-tree';
import { COMPONENT_MOUNT, ComponentMount } from './mount-point';

/** What a form's view is built against, captured once where the form is instantiated; `context` feeds the content gates. */
export interface ViewScope {
  /** The element injector the formFields resolve through: the host's, or the stepper's. */
  readonly injector: Injector;

  readonly environment: EnvironmentInjector;

  readonly controls: ControlAdapter;

  readonly layout: LayoutAdapter;

  readonly context: Signal<FormLayoutContext>;

  readonly model: WritableSignal<Record<string, unknown>>;

  /** What the host declared for the fields, by field path. */
  readonly bindings: BindingRecord;

  /** What an output handler receives beside the payload. */
  readonly handlerContext: FormContext;
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

interface Entry {
  readonly row: ViewRow;
  readonly visible: Signal<boolean>;
}

function itemOf(scope: ViewScope, placement: GridPlacement | undefined): LayoutClasses {
  return scope.layout.item(placement ?? {});
}

/** A group's or array's placement: the block class first, and a full-row span when nothing placed it. */
function blockItem(base: string, placement: LayoutClasses): LayoutClasses {
  const placed = Boolean(placement.class) || Object.keys(placement.style ?? {}).length > 0;
  const classes = placed ? [base, placement.class] : [base, 'ngx-formad-col-full'];

  return { class: classes.filter(Boolean).join(' '), style: placement.style };
}

function componentFor(node: ControlNode, controls: ControlAdapter): Type<object> {
  if (node.control) return node.control.component;
  if (node.node.type === CUSTOM_FIELD) {
    throw new Error(`ngx-formad: field "${node.key}" is a customField(); place it with formLayout().control(key, config).`);
  }

  const component = controls.controlFor(node.node.type) ?? controls.controlFor('text');
  if (!component) throw new Error(`ngx-formad: no formField is registered for "${node.node.type}", nor a text fallback.`);

  return component;
}

/** A field's declared inputs as `createComponent` takes them, each read live. */
function declaredInputs(inputs: BindingRecord): Binding[] {
  return Object.entries(inputs).flatMap(([name, value]) =>
    value === undefined ? [] : [inputBinding(name, () => read(value))],
  );
}

/** A field's declared output handlers as `createComponent` takes them, each handed the payload and the context. */
function declaredOutputs(outputs: BindingRecord, ctx: FormContext): Binding[] {
  return Object.entries(outputs).flatMap(([name, handler]) => {
    if (handler === undefined) return [];
    if (typeof handler !== 'function') throw new Error(`ngx-formad: output "${name}" needs a handler.`);

    return [outputBinding(name, (payload) => handler(payload, ctx))];
  });
}

/** A field's formField as its mount point will create it: `FormField` bound to the field, `LayoutItem` placing it, the node's props and the declared inputs and outputs. */
function fieldMount(node: ControlNode, field: FieldLeaf, scope: ViewScope): ComponentMount {
  const placement = itemOf(scope, node.layout);
  const inputs = bindingsAt(scope.bindings, [...node.path, 'inputs']);
  const outputs = bindingsAt(scope.bindings, [...node.path, 'outputs']);
  const props = node.control
    ? []
    : Object.entries(extraInputsFor(node.node))
        .filter(([name]) => !(name in inputs))
        .map(([name, value]) => inputBinding(name, () => read(value)));

  return {
    component: componentFor(node, scope.controls),
    directives: [
      { type: FormField, bindings: [inputBinding('formField', () => field)] },
      { type: LayoutItem, bindings: [inputBinding('ngxFormadItem', () => placement)] },
    ],
    bindings: [...props, ...declaredInputs(inputs), ...declaredOutputs(outputs, scope.handlerContext)],
    environment: scope.environment,
  };
}

/** The injector a row hands `NgComponentOutlet`: the mount for its mount point, over the scope's element injector. */
export function mountInjector(mount: ComponentMount, parent: Injector): Injector {
  return Injector.create({ providers: [{ provide: COMPONENT_MOUNT, useValue: mount }], parent });
}

type BlankValue = string | boolean | null | BlankItem | BlankValue[];

type BlankItem = { [key: string]: BlankValue };

function blankValue(type: FieldNode['type']): BlankValue {
  switch (type) {
    case 'number':
    case 'date':
    case 'select':
    case 'radio':
    case 'file':
      return null;
    case 'checkbox':
      return false;
    default:
      return '';
  }
}

function blankEntries(node: RenderNode): [string, BlankValue][] {
  switch (node.kind) {
    case RenderNodeKind.Content:
    case RenderNodeKind.Row:
      return [];
    case RenderNodeKind.Group:
      return [[node.key, blankItem(node.children)]];
    case RenderNodeKind.Array:
      return [[node.key, []]];
    case RenderNodeKind.Control:
      return [[node.key, blankValue(node.node.type)]];
  }
}

function blankItem(nodes: readonly RenderNode[]): BlankItem {
  return Object.fromEntries(nodes.flatMap((node) => blankEntries(node)));
}

/** A repeating group's row: one item per element of the value, kept across writes while its field tree stays. */
function arrayRow(node: ArrayNode, field: FieldItems, scope: ViewScope): ArrayRow {
  const state = field();
  const itemAt = (tree: FieldLeaf | undefined, index: number): ArrayItem => {
    if (tree === undefined || !isLevel(tree)) {
      throw new Error(`ngx-formad: item ${index} of "${node.key}" needs an object value.`);
    }

    return { tree, level: buildLevel(node.item, tree, {}, scope) };
  };
  const items = linkedSignal<readonly (FieldLeaf | undefined)[], readonly ArrayItem[]>({
    source: () => Array.from(field),
    computation: (trees, previous) =>
      trees.map((tree, index) => previous?.value.find((item) => item.tree === tree) ?? itemAt(tree, index)),
  });

  return {
    kind: RenderNodeKind.Array,
    node,
    items,
    item: blockItem('ngx-formad-array', itemOf(scope, node.layout)),
    add: () => state.value.update((current) => [...current, blankItem(node.item)]),
    remove: (index) => state.value.update((current) => current.filter((_, at) => at !== index)),
  };
}

function entryOf(node: RenderNode, tree: FieldLevel, scope: ViewScope): Entry | null {
  if (node.kind === RenderNodeKind.Content) {
    if (node.children.length === 0) return null;

    return {
      row: { kind: node.kind, node, item: itemOf(scope, node.layout) },
      visible: computed(() => node.visibleWhen?.(scope.context()) ?? true),
    };
  } else if (node.kind === RenderNodeKind.Row) {
    const level = buildLevel(node.children, tree, node.grid, scope);

    return {
      row: { kind: node.kind, node, level, item: itemOf(scope, node.layout) },
      visible: computed(() => level.rows().length > 0),
    };
  }

  if (!Object.hasOwn(tree, node.key)) {
    throw new Error(`ngx-formad: the form model has no field "${node.key}" in tree`);
  }

  const field = tree[node.key];
  if (field === undefined) throw new Error(`
    ngx-formad: the form model field "${node.key}" is empty in tree.
  `);

  const shown = (): boolean => !field().hidden();

  switch (node.kind) {
    case RenderNodeKind.Control:
      return {
        row: { kind: node.kind, node, injector: mountInjector(fieldMount(node, field, scope), scope.injector) },
        visible: computed(shown),
      };
    case RenderNodeKind.Group: {
      if (!isLevel(field)) throw new Error(`ngx-formad: group "${node.key}" needs an object value.`);

      const level = buildLevel(node.children, field, { cols: node.maxCols }, scope);

      return {
        row: { kind: node.kind, node, level, item: blockItem('ngx-formad-group', itemOf(scope, node.layout)) },
        visible: computed(() => shown() && level.rows().length > 0),
      };
    }
    case RenderNodeKind.Array:
      if (!isItems(field)) throw new Error(`ngx-formad: array "${node.key}" needs an array value.`);

      return { row: arrayRow(node, field, scope), visible: computed(shown) };
  }
}

/**
 * Builds one level of a form's view over its nodes and field tree, and hands back the grid and a computed of the rows
 * currently worth drawing: hidden fields, gated content and levels with nothing to show drop out. A formField is
 * described here and created by its row's mount point, so a hidden field has none.
 */
export function buildLevel(nodes: readonly RenderNode[], tree: FieldLevel, grid: GridLayout, scope: ViewScope): FormLevel {
  const entries = nodes.flatMap((node) => {
    const entry = entryOf(node, tree, scope);

    return entry === null ? [] : [entry];
  });

  return {
    container: scope.layout.container(grid),
    rows: computed(() => entries.filter((entry) => entry.visible()).map((entry) => entry.row)),
  };
}
