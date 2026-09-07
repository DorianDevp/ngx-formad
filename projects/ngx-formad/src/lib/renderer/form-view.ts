import {
  ApplicationRef,
  computed,
  createComponent,
  EnvironmentInjector,
  Injector,
  inputBinding,
  outputBinding,
  Signal,
  signal,
  Type,
  WritableSignal,
} from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { CUSTOM_FIELD } from 'formodel';
import { OutputEffect } from '../builders/shared-link';
import { ControlAdapter } from '../controls/control-adapter';
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
import { ItemSpec, LayoutAdapter, LayoutClasses, LayoutSpec } from '../layout/layout-adapter';
import { LayoutItem } from '../layout/layout-item';
import { FieldItems, FieldLeaf, FieldLevel, isItems, isLevel } from './field-tree';

/** What a form's view is built against, captured once where the form is instantiated. */
export interface ViewScope {
  /** The element injector the formFields resolve through: the host's, or the stepper's. */
  readonly injector: Injector;

  readonly environment: EnvironmentInjector;

  readonly appRef: ApplicationRef;

  readonly controls: ControlAdapter;

  readonly layout: LayoutAdapter;

  readonly context: Signal<FormLayoutContext>;

  readonly model: WritableSignal<Record<string, unknown>>;

  readonly effects: readonly OutputEffect[];

  /** Tears down what this scope created; a nested scope registers here and unregisters when it goes early. */
  readonly disposers: Set<() => void>;
}

/** One level of a form's view: its grid and the rows worth drawing right now. */
export interface FormLevel {
  readonly container: LayoutClasses;

  readonly rows: Signal<readonly ViewRow[]>;
}

/** A formField's row; `content` is its host element, for projection where the row stands. */
export interface ControlRow {
  readonly kind: RenderNodeKind.Control;

  readonly node: ControlNode;

  readonly content: Node[][];
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

/** One item of a repeating group: its field tree, which keys the view, and its level. */
export interface ArrayItem {
  readonly tree: FieldLevel;

  readonly level: FormLevel;
}

/** A repeating group; items change through `add` and `remove`, which also create and tear down their formFields. */
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

/** Runs every disposer once, tolerating disposers that remove themselves. */
export function disposeAll(disposers: Set<() => void>): void {
  for (const dispose of [...disposers]) dispose();
  disposers.clear();
}

/** A scope whose creations can go on their own, and still go with the parent. */
function childScope(scope: ViewScope): { readonly scope: ViewScope; dispose(): void } {
  const disposers = new Set<() => void>();
  const dispose = (): void => {
    scope.disposers.delete(dispose);
    disposeAll(disposers);
  };
  scope.disposers.add(dispose);

  return { scope: { ...scope, disposers }, dispose };
}

function samePath(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((segment, index) => segment === b[index]);
}

function itemOf(scope: ViewScope, spec: ItemSpec | undefined): LayoutClasses {
  return scope.layout.item(spec ?? {});
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
    throw new Error(`ngx-formad: field "${node.key}" is a customField(); place it with formLayout().control(key, Component).`);
  }

  const component = controls.controlFor(node.node.type) ?? controls.controlFor('text');
  if (!component) throw new Error(`ngx-formad: no formField is registered for "${node.node.type}", nor a text fallback.`);

  return component;
}

/**
 * Creates a field's formField: `FormField` on the host bound to the field, `LayoutItem` for its placement, the node's
 * inputs and its output effects. The view is attached to the application and rendered on the next tick; a slot
 * projects the host element wherever the row stands, and the element outlives the row.
 */
function createFormField(node: ControlNode, field: FieldLeaf, scope: ViewScope): Node[][] {
  const item = itemOf(scope, node.layout);
  const inputs = node.control
    ? Object.entries(node.control.inputs).map(([name, input]) =>
        inputBinding(name, () => input.read(scope.context())),
      )
    : Object.entries(extraInputsFor(node.node)).map(([name, value]) => inputBinding(name, () => read(value)));
  const outputs = scope.effects
    .filter((effect) => samePath(effect.modelPath, node.path))
    .map((effect) => outputBinding(effect.output, (payload) => effect.handler(payload, scope.model)));

  const ref = createComponent(componentFor(node, scope.controls), {
    environmentInjector: scope.environment,
    elementInjector: scope.injector,
    directives: [
      { type: FormField, bindings: [inputBinding('formField', () => field)] },
      { type: LayoutItem, bindings: [inputBinding('ngxFormadItem', () => item)] },
    ],
    bindings: [...inputs, ...outputs],
  });
  scope.appRef.attachView(ref.hostView);
  ref.changeDetectorRef.markForCheck();
  scope.disposers.add(() => ref.destroy());

  return [[ref.location.nativeElement]];
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

/** A repeating group's row. Items and their formFields come and go through `add` and `remove` only. */
function arrayRow(node: ArrayNode, field: FieldItems, scope: ViewScope): ArrayRow {
  const state = field();
  const disposals = new Map<ArrayItem, () => void>();

  const itemAt = (index: number): ArrayItem => {
    const tree = field[index];
    if (tree === undefined || !isLevel(tree)) {
      throw new Error(`ngx-formad: item ${index} of "${node.key}" needs an object value.`);
    }
    const child = childScope(scope);
    const item: ArrayItem = { tree, level: buildLevel(node.item, tree, {}, child.scope) };
    disposals.set(item, child.dispose);

    return item;
  };

  const items = signal<readonly ArrayItem[]>(Array.from({ length: state.value().length }, (_, index) => itemAt(index)));

  return {
    kind: RenderNodeKind.Array,
    node,
    items,
    item: blockItem('ngx-formad-array', itemOf(scope, node.layout)),
    add: () => {
      state.value.update((current) => [...current, blankItem(node.item)]);
      const added = itemAt(items().length);
      items.update((current) => [...current, added]);
    },
    remove: (index) => {
      const removed = items()[index];
      if (removed === undefined) return;

      state.value.update((current) => current.filter((_, at) => at !== index));
      items.update((current) => current.filter((_, at) => at !== index));
      disposals.get(removed)?.();
      disposals.delete(removed);
    },
  };
}

function entryOf(node: RenderNode, tree: FieldLevel, scope: ViewScope): Entry | null {
  if (node.kind === RenderNodeKind.Content) {
    if (node.children.length === 0) return null;

    return {
      row: { kind: node.kind, node, item: itemOf(scope, node.layout) },
      visible: computed(() => node.visibleWhen?.(scope.context()) ?? true),
    };
  }
  if (node.kind === RenderNodeKind.Row) {
    const level = buildLevel(node.children, tree, node.grid, scope);

    return {
      row: { kind: node.kind, node, level, item: itemOf(scope, node.layout) },
      visible: computed(() => level.rows().length > 0),
    };
  }

  const field = tree[node.key];
  if (field === undefined) throw new Error(`ngx-formad: the form model has no field "${node.key}".`);
  const shown = (): boolean => !field().hidden();

  switch (node.kind) {
    case RenderNodeKind.Control:
      return {
        row: { kind: node.kind, node, content: createFormField(node, field, scope) },
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
 * Builds one level of a form's view over its nodes and field tree, formFields included, and hands back the grid and
 * a computed of the rows currently worth drawing: hidden fields, gated content and levels with nothing to show drop out.
 */
export function buildLevel(nodes: readonly RenderNode[], tree: FieldLevel, grid: LayoutSpec, scope: ViewScope): FormLevel {
  const entries = nodes.flatMap((node) => {
    const entry = entryOf(node, tree, scope);

    return entry === null ? [] : [entry];
  });

  return {
    container: scope.layout.container(grid),
    rows: computed(() => entries.filter((entry) => entry.visible()).map((entry) => entry.row)),
  };
}
