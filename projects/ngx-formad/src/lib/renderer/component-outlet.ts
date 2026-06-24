import { afterNextRender, Component, input, viewChild, ViewContainerRef } from '@angular/core';
import { ComponentNode } from '../builders/nodes';

// Renders one dynamic component from its node. The bindings were normalized at
// build time (static values wrapped as getters, outputs as listeners), so here
// it is a single `createComponent` call. Visibility is the caller's `@if` — a
// hidden component is never instantiated, which keeps it out of completion and
// out of the way, matching how hidden forms are handled.
@Component({
  selector: 'ngx-formad-component-outlet',
  host: { style: 'display: contents' },
  template: `<ng-container #anchor />`,
})
export class ComponentOutlet {
  readonly node = input.required<ComponentNode>();

  private readonly anchor = viewChild.required('anchor', { read: ViewContainerRef });

  constructor() {
    afterNextRender(() => {
      const node = this.node();
      this.anchor().createComponent(node.component, { bindings: [...node.bindings] });
    });
  }
}
