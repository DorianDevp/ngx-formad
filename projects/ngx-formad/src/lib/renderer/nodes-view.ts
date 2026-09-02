import { Component, computed, inject, input } from '@angular/core';
import { FieldState, FieldTree } from '@angular/forms/signals';
import { LAYOUT_ADAPTER } from '../provide';
import { ItemSpec, LayoutSpec } from '../layout/layout-adapter';
import {
  ArrayNode,
  ControlNode,
  FormContentNode,
  FormLayoutContext,
  FormRowNode,
  GroupNode,
  RenderNode,
} from '../form-config/form-config';
import { ContentChild } from '../builders/content';
import { FormadWizard } from '../runtime/wizard-context';
import { ContentView } from './content-view';
import { FieldOutlet } from './field-outlet';
import { BoundOutputEffect } from './output-effect';

// Draws one level of the render tree, recursing into nested groups. It is the
// recursive core the flat `FormRenderer` of old grew into: a control becomes a
// `FieldOutlet`; a group becomes a labelled fieldset whose body is *this same
// component* over the group's children and the matching child field tree
// (`root.location` → its `city`, `street`, …). Validation needs nothing special —
// `form(model)` already nests the `FieldTree` and folds validity over the whole.
@Component({
  selector: 'ngx-formad-nodes',
  imports: [FieldOutlet, ContentView],
  // `display: contents` so this wrapper adds no layout box — the grid `<div>` below
  // is the real container, and nested groups stack without piling up extra nesting.
  host: { style: 'display: contents' },
  template: `
    <div [class]="containerClass()" [style]="containerStyle()">
      @for (node of nodes(); track node.key) {
        <!-- Honor the native field state: a field hidden by the schema's
             \`hidden()\` logic drops out of the DOM (and out of validation). -->
        @if (!hiddenAt(node.key)) {
        @switch (node.kind) {
          @case ('group') {
            <fieldset [class]="blockClass('ngx-formad-group', group(node).layout)" [style]="itemStyle(group(node).layout)">
              @if (group(node).label) {
                <legend class="ngx-formad-group-label">{{ group(node).label }}</legend>
              }

              <ngx-formad-nodes
                [nodes]="group(node).children"
                [tree]="childTree(node.key)"
                [model]="childModel(node.key)"
                [layout]="{ cols: group(node).maxCols }"
                [effects]="effects()"
              />
            </fieldset>
          }
          @case ('control') {
            <!-- The directive mounts the control as the grid item itself — no
                 wrapper div; the field's own layout lands on the control host. -->
            <ng-container
              ngxFormadField
              [node]="leaf(node.key)"
              [config]="control(node)"
              [effects]="effects()"
              [context]="layoutContext()"
            />
          }
          @case ('content') {
            <!-- Prose in the field flow: its own grid slot, gated like a component. -->
            @if (nodeVisible(node) && contentChildren(node).length) {
              <div
                [class]="itemClass(contentNode(node).layout)"
                [style]="itemStyle(contentNode(node).layout)"
              >
                <ngx-formad-content [children]="contentChildren(node)" />
              </div>
            }
          }
          @case ('row') {
            <!-- A nested layout row: its own sub-grid over the same field-tree level. -->
            <div [class]="itemClass(rowNode(node).layout)" [style]="itemStyle(rowNode(node).layout)">
              <ngx-formad-nodes
                [nodes]="rowNode(node).children"
                [tree]="tree()"
                [model]="model()"
                [layout]="rowNode(node).grid"
                [effects]="effects()"
              />
            </div>
          }
          @case ('array') {
            <fieldset [class]="blockClass('ngx-formad-array', array(node).layout)" [style]="itemStyle(array(node).layout)">

              @if (array(node).node.label) {
                <legend class="ngx-formad-group-label">{{ array(node).node.label }}</legend>
              }

              @for (i of itemIndexes(node.key); track i) {
                <div class="ngx-formad-array-item">
                  <ngx-formad-nodes
                    [nodes]="array(node).item"
                    [tree]="itemTree(node.key, i)"
                    [model]="itemModel(node.key, i)"
                  />

                  @if (array(node).node.removable !== false) {
                    <button
                      type="button"
                      class="ngx-formad-array-remove"
                      (click)="removeItem(node.key, i)"
                    >
                      {{ array(node).node.removeLabel ?? 'Remove' }}
                    </button>
                  }
                </div>
              }
              @if (array(node).node.addable !== false) {
                <button type="button" class="ngx-formad-array-add" (click)="addItem(node)">
                  {{ array(node).node.addLabel ?? 'Add' }}
                </button>
              }
            </fieldset>
          }
        }
        }
      }
    </div>
  `,
})
export class NodesView {
  /** The nodes at this level of the tree. */
  readonly nodes = input.required<readonly RenderNode[]>();
  /** The field tree at this level, indexable by child key. */
  readonly tree = input.required<Record<string, FieldTree<unknown>>>();
  /** The live model VALUE at this level — fed to layout components' input getters
   *  so their bindings stay reactive as fields change. */
  readonly model = input<Record<string, unknown>>({});
  /** How this level's children are arranged; resolved through the layout adapter. */
  readonly layout = input<LayoutSpec>({});
  /** Control-output effects, passed through to each field directive (and nested groups). */
  readonly effects = input<readonly BoundOutputEffect[]>([]);

  private readonly layoutAdapter = inject(LAYOUT_ADAPTER);
  // Null for a standalone form; the cross-step store when inside `<ngx-formad-stepper>`.
  private readonly wizard = inject(FormadWizard, { optional: true });

  // The leaf field tree a control binds to, and the child tree a group descends
  // into — both a plain index into the current level (the native `root.x` move).
  protected leaf(key: string): FieldTree<unknown> {
    return this.tree()[key];
  }
  protected childTree(key: string): Record<string, FieldTree<unknown>> {
    return this.tree()[key] as unknown as Record<string, FieldTree<unknown>>;
  }

  // Whether the field/group at `key` is hidden by the schema's native `hidden()`
  // logic — read reactively so the `@if` toggles as the condition changes.
  protected hiddenAt(key: string): boolean {
    const node = this.tree()[key];
    return node ? (node as unknown as () => FieldState<unknown>)().hidden() : false;
  }

  // The child model a group descends into, and the item model an array item binds
  // to — plain reads of the current model value, kept reactive via the input signal.
  protected childModel(key: string): Record<string, unknown> {
    return (this.model()[key] as Record<string, unknown>) ?? {};
  }
  protected itemModel(key: string, i: number): Record<string, unknown> {
    return ((this.model()[key] as unknown[])?.[i] as Record<string, unknown>) ?? {};
  }

  // Narrowing helpers for the template's `@switch` (templates can't cast).
  protected control(node: RenderNode): ControlNode {
    return node as ControlNode;
  }
  protected group(node: RenderNode): GroupNode {
    return node as GroupNode;
  }
  protected array(node: RenderNode): ArrayNode {
    return node as ArrayNode;
  }
  protected contentNode(node: RenderNode): FormContentNode {
    return node as FormContentNode;
  }
  protected rowNode(node: RenderNode): FormRowNode {
    return node as FormRowNode;
  }

  protected readonly layoutContext = computed<FormLayoutContext>(() => ({
    model: this.model(),
    shared: this.wizard?.sharedOrNull() ?? null,
  }));

  protected nodeVisible(node: RenderNode): boolean {
    const gate = (node as FormContentNode).visibleWhen;
    return gate ? gate(this.layoutContext()) : true;
  }

  // Hand-built or deserialized content may carry no children; that is an empty
  // block, not a crash (`children` is `input.required` on the view).
  protected contentChildren(node: RenderNode): readonly ContentChild[] {
    return (node as FormContentNode).children ?? [];
  }

  // An item's grid placement (colSpan/colStart), as the adapter answers it. Both
  // halves matter: the class adapter returns classes, the zero-dependency CSS-grid
  // default returns *styles*, and a consumer reading only one silently drops the
  // placement of every component, content block and row.
  protected itemClass(spec: ItemSpec | undefined): string {
    return this.layoutAdapter.item(spec ?? {}).class ?? '';
  }
  protected itemStyle(spec: ItemSpec | undefined): Record<string, string> {
    return this.layoutAdapter.item(spec ?? {}).style ?? {};
  }

  // A group or array spans the whole row unless the overlay placed it - the
  // full-width default is what makes a nested fieldset readable, but it is a
  // default, not a rule the layout cannot override.
  protected blockClass(base: string, spec: ItemSpec | undefined): string {
    const placement = spec ? this.itemClass(spec) : '';
    const hasStyle = spec ? Object.keys(this.itemStyle(spec)).length > 0 : false;
    if (!spec || (!placement && !hasStyle)) return `${base} ngx-formad-col-full`;
    return placement ? `${base} ${placement}` : base;
  }

  // ── Repeating arrays ──
  // The array field is index-by-number to item field trees; its value signal
  // (`U[]`) drives the count, so reading it here keeps `@for` reactive, and
  // add/remove are plain immutable updates of that signal.
  private arrayState(key: string): FieldState<unknown[]> {
    return (this.tree()[key] as unknown as () => FieldState<unknown[]>)();
  }
  protected itemIndexes(key: string): number[] {
    const length = this.arrayState(key).value().length;
    return Array.from({ length }, (_, i) => i);
  }
  protected itemTree(key: string, i: number): Record<string, FieldTree<unknown>> {
    const items = this.tree()[key] as unknown as Record<number, FieldTree<unknown>>;
    return items[i] as unknown as Record<string, FieldTree<unknown>>;
  }
  protected addItem(node: RenderNode): void {
    const blank = blankItem(this.array(node).item);
    this.arrayState(node.key).value.update((items) => [...items, blank]);
  }
  protected removeItem(key: string, i: number): void {
    this.arrayState(key).value.update((items) => items.filter((_, idx) => idx !== i));
  }

  private readonly container = computed(() => this.layoutAdapter.container(this.layout()));
  protected readonly containerClass = computed(() => this.container().class ?? '');
  protected readonly containerStyle = computed(() => this.container().style ?? {});
}

// A fresh array item, built from the item's render nodes: controls get a kind-
// appropriate empty value, groups recurse, nested arrays start empty.
// The empty value a control kind starts from. A date, a select and a file are all
// "nothing chosen", which is `null` - seeding them with `''` types a new array item
// differently from the model factory that made the first one.
function blankValue(type: string): unknown {
  if (type === 'number' || type === 'date' || type === 'select' || type === 'radio') return null;
  if (type === 'file') return null;
  if (type === 'checkbox') return false;
  return '';
}

function blankItem(nodes: readonly RenderNode[]): Record<string, unknown> {
  const item: Record<string, unknown> = {};
  for (const node of nodes) {
    if (node.kind === 'content' || node.kind === 'row') continue;
    if (node.kind === 'group') item[node.key] = blankItem(node.children);
    else if (node.kind === 'array') item[node.key] = [];
    else item[node.key] = blankValue(node.node.type);
  }
  return item;
}
