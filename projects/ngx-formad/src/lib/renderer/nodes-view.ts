import { Component, computed, inject, input } from '@angular/core';
import { ContentChild } from '../builders/content';
import {
  ArrayNode,
  ControlNode,
  FieldNode,
  FormContentNode,
  FormLayoutContext,
  FormRowNode,
  GroupNode,
  RenderNode,
  RenderNodeKind,
} from '../form-config/form-config';
import { ItemSpec, LayoutAdapter, LayoutSpec } from '../layout/layout-adapter';
import { LAYOUT_ADAPTER } from '../provide';
import { FormadWizard } from '../runtime/wizard-context';
import { ContentView } from './content-view';
import { FieldOutlet } from './field-outlet';
import { FieldItems, FieldLeaf, FieldLevel, isItems, isLevel } from './instantiate-form';
import { BoundOutputEffect } from './output-effect';

interface Placement {
  readonly itemClass: string;
  readonly itemStyle: Readonly<Record<string, string>>;
}

interface ControlRow extends Placement {
  readonly kind: RenderNodeKind.Control;
  readonly key: string;
  readonly node: ControlNode;
  readonly tree: FieldLeaf;
}

interface GroupRow extends Placement {
  readonly kind: RenderNodeKind.Group;
  readonly key: string;
  readonly label: string;
  readonly children: readonly RenderNode[];
  readonly tree: FieldLevel;
  readonly layout: LayoutSpec;
  readonly blockClass: string;
}

interface ArrayItemRow {
  readonly index: number;
  readonly tree: FieldLevel;
}

interface ArrayRow extends Placement {
  readonly kind: RenderNodeKind.Array;
  readonly key: string;
  readonly node: ArrayNode;
  readonly state: ReturnType<FieldItems>;
  readonly items: readonly ArrayItemRow[];
  readonly blockClass: string;
}

interface ContentRow extends Placement {
  readonly kind: RenderNodeKind.Content;
  readonly key: string;
  readonly children: readonly ContentChild[];
}

interface LayoutRow extends Placement {
  readonly kind: RenderNodeKind.Row;
  readonly key: string;
  readonly children: readonly RenderNode[];
  readonly grid: LayoutSpec;
}

type ViewRow = ControlRow | GroupRow | ArrayRow | ContentRow | LayoutRow;

interface LevelScope {
  readonly tree: FieldLevel;
  readonly context: FormLayoutContext;
  readonly adapter: LayoutAdapter;
}

function placementOf(adapter: LayoutAdapter, spec: ItemSpec | undefined): Placement {
  const classes = adapter.item(spec ?? {});

  return { itemClass: classes.class ?? '', itemStyle: classes.style ?? {} };
}

function blockClass(base: string, placement: Placement): string {
  const placed = placement.itemClass.length > 0 || Object.keys(placement.itemStyle).length > 0;
  if (!placed) return `${base} ngx-formad-col-full`;

  return placement.itemClass ? `${base} ${placement.itemClass}` : base;
}

function groupRow(node: GroupNode, field: FieldLeaf, scope: LevelScope): GroupRow {
  if (!isLevel(field)) throw new Error(`ngx-formad: group "${node.key}" needs an object value.`);

  const placement = placementOf(scope.adapter, node.layout);

  return {
    kind: RenderNodeKind.Group,
    key: node.key,
    label: node.label,
    children: node.children,
    tree: field,
    layout: { cols: node.maxCols },
    blockClass: blockClass('ngx-formad-group', placement),
    ...placement,
  };
}

function arrayRow(node: ArrayNode, field: FieldLeaf, scope: LevelScope): ArrayRow {
  if (!isItems(field)) throw new Error(`ngx-formad: array "${node.key}" needs an array value.`);

  const items: ArrayItemRow[] = [];
  let index = 0;
  for (const item of field) {
    if (item === undefined || !isLevel(item)) {
      throw new Error(`ngx-formad: item ${index} of "${node.key}" needs an object value.`);
    }
    items.push({ index, tree: item });
    index += 1;
  }
  const placement = placementOf(scope.adapter, node.layout);

  return {
    kind: RenderNodeKind.Array,
    key: node.key,
    node,
    state: field(),
    items,
    blockClass: blockClass('ngx-formad-array', placement),
    ...placement,
  };
}

function contentRow(node: FormContentNode, scope: LevelScope): ContentRow | null {
  const visible = node.visibleWhen ? node.visibleWhen(scope.context) : true;
  if (!visible || node.children.length === 0) return null;

  return {
    kind: RenderNodeKind.Content,
    key: node.key,
    children: node.children,
    ...placementOf(scope.adapter, node.layout),
  };
}

function layoutRow(node: FormRowNode, scope: LevelScope): LayoutRow {
  return {
    kind: RenderNodeKind.Row,
    key: node.key,
    children: node.children,
    grid: node.grid,
    ...placementOf(scope.adapter, node.layout),
  };
}

function rowOf(node: RenderNode, scope: LevelScope): ViewRow | null {
  if (node.kind === RenderNodeKind.Content) return contentRow(node, scope);
  if (node.kind === RenderNodeKind.Row) return layoutRow(node, scope);

  const field = scope.tree[node.key];
  if (field === undefined) throw new Error(`ngx-formad: the form model has no field "${node.key}".`);
  if (field().hidden()) return null;

  switch (node.kind) {
    case RenderNodeKind.Control:
      return {
        kind: RenderNodeKind.Control,
        key: node.key,
        node,
        tree: field,
        ...placementOf(scope.adapter, node.layout),
      };
    case RenderNodeKind.Group:
      return groupRow(node, field, scope);
    case RenderNodeKind.Array:
      return arrayRow(node, field, scope);
  }
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

/** Draws one level of the render tree, recursing into groups, rows and repeating arrays over the matching field trees. */
@Component({
  selector: 'ngx-formad-nodes',
  imports: [FieldOutlet, ContentView],
  host: { style: 'display: contents' },
  template: `
    <div [class]="containerClass()" [style]="containerStyle()">
      @for (row of rows(); track row.key) {
        @switch (row.kind) {
          @case (kinds.Group) {
            <fieldset [class]="row.blockClass" [style]="row.itemStyle">
              @if (row.label) {
                <legend class="ngx-formad-group-label">{{ row.label }}</legend>
              }
              <ngx-formad-nodes
                [nodes]="row.children"
                [tree]="row.tree"
                [layout]="row.layout"
                [effects]="effects()"
              />
            </fieldset>
          }
          @case (kinds.Control) {
            <ng-container
              ngxFormadField
              [node]="row.tree"
              [config]="row.node"
              [effects]="effects()"
              [context]="layoutContext()"
            />
          }
          @case (kinds.Content) {
            <div [class]="row.itemClass" [style]="row.itemStyle">
              <ngx-formad-content [children]="row.children" />
            </div>
          }
          @case (kinds.Row) {
            <div [class]="row.itemClass" [style]="row.itemStyle">
              <ngx-formad-nodes
                [nodes]="row.children"
                [tree]="tree()"
                [layout]="row.grid"
                [effects]="effects()"
              />
            </div>
          }
          @case (kinds.Array) {
            <fieldset [class]="row.blockClass" [style]="row.itemStyle">
              @if (row.node.node.label) {
                <legend class="ngx-formad-group-label">{{ row.node.node.label }}</legend>
              }
              @for (item of row.items; track item.index) {
                <div class="ngx-formad-array-item">
                  <ngx-formad-nodes [nodes]="row.node.item" [tree]="item.tree" />
                  @if (row.node.node.removable !== false) {
                    <button type="button" class="ngx-formad-array-remove" (click)="removeItem(row, item.index)">
                      {{ row.node.node.removeLabel ?? 'Remove' }}
                    </button>
                  }
                </div>
              }
              @if (row.node.node.addable !== false) {
                <button type="button" class="ngx-formad-array-add" (click)="addItem(row)">
                  {{ row.node.node.addLabel ?? 'Add' }}
                </button>
              }
            </fieldset>
          }
        }
      }
    </div>
  `,
})
export class NodesView {
  readonly nodes = input.required<readonly RenderNode[]>();

  readonly tree = input.required<FieldLevel>();

  readonly layout = input<LayoutSpec>({});

  readonly effects = input<readonly BoundOutputEffect[]>([]);

  readonly kinds = RenderNodeKind;

  private readonly layoutAdapter = inject(LAYOUT_ADAPTER);

  private readonly wizard = inject(FormadWizard, { optional: true });

  readonly layoutContext = computed<FormLayoutContext>(() => ({
    model: this.tree()().value(),
    shared: this.wizard?.sharedOrNull() ?? null,
  }));

  readonly rows = computed<readonly ViewRow[]>(() => {
    const scope: LevelScope = {
      tree: this.tree(),
      context: this.layoutContext(),
      adapter: this.layoutAdapter,
    };

    return this.nodes().flatMap((node) => {
      const row = rowOf(node, scope);

      return row === null ? [] : [row];
    });
  });

  private readonly container = computed(() => this.layoutAdapter.container(this.layout()));

  readonly containerClass = computed(() => this.container().class ?? '');

  readonly containerStyle = computed(() => this.container().style ?? {});

  addItem(row: ArrayRow): void {
    const blank = blankItem(row.node.item);
    row.state.value.update((items) => [...items, blank]);
  }

  removeItem(row: ArrayRow, index: number): void {
    row.state.value.update((items) => items.filter((_, at) => at !== index));
  }
}
