import { Component, computed, input } from '@angular/core';
import { FieldTree } from '@angular/forms/signals';
import { LayoutSpec } from '../layout/layout-adapter';
import { FormState } from './instantiate-form';
import { NodesView } from './nodes-view';
import { BoundOutputEffect } from './output-effect';

// Draws one form. It takes already-live state, never a raw config, so it does no
// `form()` call and needs no injection-context tricks — it is a pure view over a
// tree someone else instantiated. The recursion (nested groups) lives in
// `NodesView`; this is the thin root that seeds it with the top-level nodes and
// the root field tree.
@Component({
  selector: 'ngx-formad-form',
  imports: [NodesView],
  // Layout-transparent: the form is a pass-through to its grid, not a box.
  host: { style: 'display: contents' },
  template: `<ngx-formad-nodes
    [nodes]="nodes()"
    [tree]="rootTree()"
    [model]="model()"
    [layout]="grid()"
    [effects]="effects()"
  />`,
})
export class FormRenderer {
  /** The live form state, from `instantiateForm(config)`. */
  readonly state = input.required<FormState<Record<string, unknown>>>();
  /** How the top-level fields are arranged; resolved through the layout adapter.
   *  A grid declared on the config's layout overlay takes precedence over this. */
  readonly layout = input<LayoutSpec>({});
  /** Control-output effects to wire onto matching fields (from a stepper's `addForm`). */
  readonly effects = input<readonly BoundOutputEffect[]>([]);

  protected readonly nodes = computed(() => this.state().nodes);
  // The overlay's grid wins over the input; without either it's the empty default.
  protected readonly grid = computed(() => this.state().grid ?? this.layout());
  // The live model value, fed to component input getters via `NodesView` so their
  // bindings stay reactive as fields change.
  protected readonly model = computed(() => this.state().model());
  // The root field tree, indexed by top-level key — the same `root.email` move
  // native templates use, here handed to the recursive renderer.
  protected readonly rootTree = computed(
    () => this.state().rootForm as unknown as Record<string, FieldTree<unknown>>,
  );
}
