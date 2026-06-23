import { Component, computed, inject, input } from '@angular/core';
import { FieldTree } from '@angular/forms/signals';
import { LAYOUT_ADAPTER } from '../provide';
import { LayoutSpec } from '../layout/layout-adapter';
import { ControlNode, GroupNode, RenderNode } from '../form-config/form-config';
import { FieldOutlet } from './field-outlet';

// Draws one level of the render tree, recursing into nested groups. It is the
// recursive core the flat `FormRenderer` of old grew into: a control becomes a
// `FieldOutlet`; a group becomes a labelled fieldset whose body is *this same
// component* over the group's children and the matching child field tree
// (`root.location` → its `city`, `street`, …). Validation needs nothing special —
// `form(model)` already nests the `FieldTree` and folds validity over the whole.
@Component({
  selector: 'ngx-formad-nodes',
  imports: [FieldOutlet, NodesView],
  template: `
    <div [class]="containerClass()" [style]="containerStyle()">
      @for (node of nodes(); track node.key) {
        @switch (node.kind) {
          @case ('group') {
            <fieldset class="ngx-formad-group" style="grid-column: 1 / -1">
              @if (group(node).label) {
                <legend class="ngx-formad-group-label">{{ group(node).label }}</legend>
              }
              <ngx-formad-nodes
                [nodes]="group(node).children"
                [tree]="childTree(node.key)"
                [layout]="{ cols: group(node).maxCols }"
              />
            </fieldset>
          }
          @case ('control') {
            <div [class]="itemClass(node)" [style]="itemStyle(node)">
              <ngx-formad-field-outlet [node]="leaf(node.key)" [config]="control(node)" />
            </div>
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
  /** How this level's children are arranged; resolved through the layout adapter. */
  readonly layout = input<LayoutSpec>({});

  private readonly layoutAdapter = inject(LAYOUT_ADAPTER);

  // The leaf field tree a control binds to, and the child tree a group descends
  // into — both a plain index into the current level (the native `root.x` move).
  protected leaf(key: string): FieldTree<unknown> {
    return this.tree()[key];
  }
  protected childTree(key: string): Record<string, FieldTree<unknown>> {
    return this.tree()[key] as unknown as Record<string, FieldTree<unknown>>;
  }

  // Narrowing helpers for the template's `@switch` (templates can't cast).
  protected control(node: RenderNode): ControlNode {
    return node as ControlNode;
  }
  protected group(node: RenderNode): GroupNode {
    return node as GroupNode;
  }

  private readonly container = computed(() => this.layoutAdapter.container(this.layout()));
  protected readonly containerClass = computed(() => this.container().class ?? '');
  protected readonly containerStyle = computed(() => this.container().style ?? {});

  protected itemClass(node: ControlNode): string {
    return this.layoutAdapter.item(node.layout ?? {}).class ?? '';
  }
  protected itemStyle(node: ControlNode): Record<string, string> {
    return this.layoutAdapter.item(node.layout ?? {}).style ?? {};
  }
}
