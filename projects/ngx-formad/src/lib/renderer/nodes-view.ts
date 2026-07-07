import { Component, computed, inject, input, inputBinding, outputBinding } from '@angular/core';
import { FieldState, FieldTree } from '@angular/forms/signals';
import { LAYOUT_ADAPTER } from '../provide';
import { ItemSpec, LayoutSpec } from '../layout/layout-adapter';
import {
  ArrayNode,
  ControlNode,
  FormComponentContext,
  FormComponentNode,
  FormRowNode,
  GroupNode,
  RenderNode,
} from '../form-config/form-config';
import { ComponentNode } from '../builders/nodes';
import { FormadWizard } from '../runtime/wizard-context';
import { ComponentOutlet } from './component-outlet';
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
  imports: [FieldOutlet, ComponentOutlet],
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
            <fieldset class="ngx-formad-group ngx-formad-col-full">
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
            />
          }
          @case ('component') {
            <!-- A layout component: gated by its own visibility, placed in the grid
                 by its item span, bound to the live form context. -->
            @if (componentVisible(node)) {
              <div [class]="itemClass(component(node).layout)">
                <ngx-formad-component-outlet [node]="outlet(node)" />
              </div>
            }
          }
          @case ('row') {
            <!-- A nested layout row: its own sub-grid over the same field-tree level. -->
            <div [class]="itemClass(rowNode(node).layout)">
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
            <fieldset class="ngx-formad-array ngx-formad-col-full">

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
  protected component(node: RenderNode): FormComponentNode {
    return node as FormComponentNode;
  }
  protected rowNode(node: RenderNode): FormRowNode {
    return node as FormRowNode;
  }

  // ── Layout components ──
  // The context every component input getter reads: the live model value, the field
  // tree at this level (per-field errors/touched), and the shared store when inside a
  // stepper. Reading `model()` here is what keeps a component's bindings reactive.
  private ctx(): FormComponentContext {
    return {
      model: this.model(),
      form: this.tree() as unknown as FieldTree<Record<string, unknown>>,
      shared: this.wizard?.sharedOrNull() ?? null,
    };
  }

  // A component is shown unless its `visibleWhen` gate — read reactively — says no.
  protected componentVisible(node: RenderNode): boolean {
    const spec = node as FormComponentNode;
    return spec.visibleWhen ? spec.visibleWhen(this.ctx()) : true;
  }

  // The layout classes for an item's grid placement (colSpan/colStart).
  protected itemClass(spec: ItemSpec | undefined): string {
    return this.layoutAdapter.item(spec ?? {}).class ?? '';
  }

  // One `ComponentNode` per component node, built once — its input bindings are
  // getters that read `ctx()` (hence the live model), so they stay reactive without
  // rebuilding when values change. `nodes()` is stable, so this map is too.
  private readonly outlets = computed(() => {
    const map = new Map<FormComponentNode, ComponentNode>();
    for (const node of this.nodes()) {
      if (node.kind !== 'component') continue;
      const inputs = Object.entries(node.inputs).map(([name, get]) =>
        inputBinding(name, () => get(this.ctx())),
      );
      const outputs = Object.entries(node.outputs).map(([name, handler]) =>
        outputBinding(name, handler as (event: unknown) => void),
      );
      map.set(node, { kind: 'component', component: node.component, bindings: [...inputs, ...outputs] });
    }
    return map;
  });
  protected outlet(node: RenderNode): ComponentNode {
    return this.outlets().get(node as FormComponentNode)!;
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
function blankItem(nodes: readonly RenderNode[]): Record<string, unknown> {
  const item: Record<string, unknown> = {};
  for (const node of nodes) {
    if (node.kind === 'component' || node.kind === 'row') continue;
    if (node.kind === 'group') item[node.key] = blankItem(node.children);
    else if (node.kind === 'array') item[node.key] = [];
    else item[node.key] = node.node.type === 'number' ? null : node.node.type === 'checkbox' ? false : '';
  }
  return item;
}
