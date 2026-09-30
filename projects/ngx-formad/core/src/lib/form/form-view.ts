import {
  Binding,
  computed,
  Injector,
  inputBinding,
  isDevMode,
  linkedSignal,
  outputBinding,
  reflectComponentType,
  Signal,
  Type,
} from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { CUSTOM_FIELD } from 'formodel';
import { ControlAdapter } from '../controls';
import { GridLayout, GridPlacement, LayoutClasses, LayoutItem } from '../layout';
import { extraInputsFor } from './control-inputs';
import { isItems, isLevel } from './field-tree';
import { bindingsAt } from './form-bindings';
import { COMPONENT_MOUNT } from './mount-point';
import { FieldItems, FieldLeaf, FieldLevel } from './types/field-tree';
import { BindingRecord } from './types/form-bindings';
import { FormContext } from './types/form-context';
import { ArrayItem, ArrayRow, ComponentMount, FormLevel, ViewRow, ViewScope } from './types/form-view';
import { ArrayNode, ControlNode, FormComponentNode, RenderNode, RenderNodeKind } from './types/render-tree';
import { FieldNode } from './types/ui-nodes';

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
    value === undefined ? [] : [inputBinding(name, () => value)],
  );
}

/** A field's declared output handlers as `createComponent` takes them, each handed the payload and the context. */
function declaredOutputs(outputs: BindingRecord, ctx: () => FormContext): Binding[] {
  return Object.entries(outputs).flatMap(([name, handler]) => {
    if (handler === undefined) return [];
    if (typeof handler !== 'function') throw new Error(`ngx-formad: output "${name}" needs a handler.`);

    return [outputBinding(name, (payload) => handler(payload, ctx()))];
  });
}

/**
 * In dev mode, says what the component does not declare: a name bound on the wrong side is an error, since the author
 * meant the other record, and a name the component declares nowhere is a warning, since host directives and inherited
 * metadata put some names beyond what the mirror reports.
 */
function checkNames(component: Type<object>, key: string, inputs: BindingRecord, outputs: BindingRecord): void {
  if (!isDevMode()) return;

  const mirror = reflectComponentType(component);
  if (!mirror) return;

  const asInput = new Set(mirror.inputs.map((entry) => entry.templateName));
  const asOutput = new Set(mirror.outputs.map((entry) => entry.templateName));
  const check = (name: string, side: 'input' | 'output', declared: Set<string>, other: Set<string>): void => {
    if (declared.has(name)) return;

    const where = `field "${key}" binds "${name}" as an ${side}`;
    if (other.has(name)) {
      throw new Error(`ngx-formad: ${where}, but ${mirror.selector} declares it as an ${side === 'input' ? 'output' : 'input'}.`);
    }
    console.warn(`ngx-formad: ${where}, which ${mirror.selector} does not declare.`);
  };
  for (const name of Object.keys(inputs)) check(name, 'input', asInput, asOutput);
  for (const name of Object.keys(outputs)) check(name, 'output', asOutput, asInput);
}

/** A field's formField as its mount point will create it: `FormField` bound to the field, `LayoutItem` placing it, the node's props and the declared inputs and outputs. */
function fieldMount(node: ControlNode, field: () => FieldLeaf, scope: ViewScope): ComponentMount {
  const placement = itemOf(scope, node.layout);
  const inputs = bindingsAt(scope.bindings, [...node.path, 'inputs']);
  const outputs = bindingsAt(scope.bindings, [...node.path, 'outputs']);
  const authored = bindingsAt(scope.bindings, [...node.path, 'bindings']);
  const own: readonly Binding[] = Array.isArray(authored) ? authored : [];
  const props = node.control
    ? []
    : Object.entries(extraInputsFor(node.node))
        .filter(([name]) => !(name in inputs))
        .map(([name, value]) => inputBinding(name, value));
  const component = componentFor(node, scope.controls);
  checkNames(component, node.key, inputs, outputs);

  return {
    component,
    directives: [
      { type: FormField, bindings: [inputBinding('formField', field)] },
      { type: LayoutItem, bindings: [inputBinding('ngxFormadItem', () => placement)] },
    ],
    bindings: [...props, ...declaredInputs(inputs), ...declaredOutputs(outputs, scope.handlerContext), ...own],
    environment: scope.environment,
  };
}

/** A placed component as its mount point will create it: `LayoutItem` placing it, its bindings read once over the form context. */
function componentMount(node: FormComponentNode, scope: ViewScope): ComponentMount {
  const placement = itemOf(scope, node.layout);
  const bindings = node.config.bindings ?? [];

  return {
    component: node.config.component,
    directives: [{ type: LayoutItem, bindings: [inputBinding('ngxFormadItem', () => placement)] }],
    bindings: typeof bindings === 'function' ? bindings(scope.context) : bindings,
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
    case RenderNodeKind.Component:
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
function arrayRow(node: ArrayNode, field: () => FieldItems, scope: ViewScope): ArrayRow {
  const itemAt = (tree: FieldLeaf | undefined, index: number): ArrayItem => {
    if (tree === undefined || !isLevel(tree)) {
      throw new Error(`ngx-formad: item ${index} of "${node.key}" needs an object value.`);
    }

    return { tree, level: buildLevel(node.item, () => tree, {}, scope) };
  };
  const items = linkedSignal<readonly (FieldLeaf | undefined)[], readonly ArrayItem[]>({
    source: () => Array.from(field()),
    computation: (trees, previous) =>
      trees.map((tree, index) => previous?.value.find((item) => item.tree === tree) ?? itemAt(tree, index)),
  });

  return {
    kind: RenderNodeKind.Array,
    node,
    items,
    item: blockItem('ngx-formad-array', itemOf(scope, node.layout)),
    add: () => field()().value.update((current) => [...current, blankItem(node.item)]),
    remove: (index) => field()().value.update((current) => current.filter((_, at) => at !== index)),
  };
}

function entryOf(node: RenderNode, tree: () => FieldLevel, scope: ViewScope): Entry | null {
  if (node.kind === RenderNodeKind.Content) {
    if (node.children.length === 0) return null;

    return {
      row: { kind: node.kind, node, item: itemOf(scope, node.layout) },
      visible: computed(() => node.visibleWhen?.(scope.context) ?? true),
    };
  } else if (node.kind === RenderNodeKind.Row) {
    const level = buildLevel(node.children, tree, node.grid, scope);

    return {
      row: { kind: node.kind, node, level, item: itemOf(scope, node.layout) },
      visible: computed(() => level.rows().length > 0),
    };
  } else if (node.kind === RenderNodeKind.Component) {
    return {
      row: { kind: node.kind, node, injector: mountInjector(componentMount(node, scope), scope.injector) },
      visible: computed(() => true),
    };
  }

  // The field tree knows its children by the model's value, so the lookup waits for the first draw, when a model
  // computed over an input has the input to read. A computed runs it once and keeps a config error for every read.
  const field = computed(() => {
    const level = tree();
    if (!Object.hasOwn(level, node.key)) throw new Error(`ngx-formad: the form model has no field "${node.key}" in tree`);

    const child = level[node.key];
    if (child === undefined) throw new Error(`ngx-formad: the form model field "${node.key}" is empty in tree.`);

    return child;
  });
  const shown = (): boolean => !field()().hidden();

  switch (node.kind) {
    case RenderNodeKind.Control:
      return {
        row: { kind: node.kind, node, injector: mountInjector(fieldMount(node, field, scope), scope.injector) },
        visible: computed(shown),
      };
    case RenderNodeKind.Group: {
      const group = computed(() => {
        const child = field();
        if (!isLevel(child)) throw new Error(`ngx-formad: group "${node.key}" needs an object value.`);

        return child;
      });
      const level = buildLevel(node.children, group, { cols: node.maxCols }, scope);

      return {
        row: { kind: node.kind, node, level, item: blockItem('ngx-formad-group', itemOf(scope, node.layout)) },
        visible: computed(() => shown() && level.rows().length > 0),
      };
    }
    case RenderNodeKind.Array: {
      const items = computed(() => {
        const child = field();
        if (!isItems(child)) throw new Error(`ngx-formad: array "${node.key}" needs an array value.`);

        return child;
      });

      return { row: arrayRow(node, items, scope), visible: computed(shown) };
    }
  }
}

/**
 * Builds one level of a form's view over its nodes and field tree, and hands back the grid and a computed of the rows
 * currently worth drawing: hidden fields, gated content and levels with nothing to show drop out. A formField is
 * described here and created by its row's mount point, so a hidden field has none. The tree is a getter: its fields
 * are looked up when the rows are first read.
 */
export function buildLevel(nodes: readonly RenderNode[], tree: () => FieldLevel, grid: GridLayout, scope: ViewScope): FormLevel {
  const entries = nodes.flatMap((node) => {
    const entry = entryOf(node, tree, scope);

    return entry === null ? [] : [entry];
  });

  return {
    container: scope.layout.container(grid),
    rows: computed(() => entries.filter((entry) => entry.visible()).map((entry) => entry.row)),
  };
}
