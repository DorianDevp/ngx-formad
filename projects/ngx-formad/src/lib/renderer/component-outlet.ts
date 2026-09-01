import {
  Component,
  ComponentRef,
  effect,
  inject,
  input,
  untracked,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { ComponentNode } from '../builders/nodes';
import { FLOW_ENVIRONMENT } from './flow-environment';

// Renders one dynamic component from its node. The bindings were normalized at
// build time (static values wrapped as getters, outputs as listeners), so mounting
// is a single `createComponent` call. Visibility is the caller's `@if` - a hidden
// component is never instantiated, which keeps it out of completion and out of the
// way, matching how hidden forms are handled.
//
// The mount follows the input rather than happening once: the renderers iterate
// nodes with `track node.key`, and a page or form swapped for another whose node
// carries the same key reuses this view with a *different* node. Freezing the first
// one left the old config's bindings driving the new component.
@Component({
  selector: 'ngx-formad-component-outlet',
  host: { style: 'display: contents' },
  template: `<ng-container #anchor />`,
})
export class ComponentOutlet {
  readonly node = input.required<ComponentNode>();

  private readonly anchor = viewChild.required('anchor', { read: ViewContainerRef });
  // The owning flow's environment, so the component resolves what the flow
  // declared with `provide(...)`; null outside a stepper (a standalone form).
  private readonly flowEnvironment = inject(FLOW_ENVIRONMENT, { optional: true });
  private ref: ComponentRef<unknown> | null = null;

  constructor() {
    effect(() => {
      const node = this.node();
      const anchor = this.anchor();
      untracked(() => {
        this.ref?.destroy();
        this.ref = anchor.createComponent(node.component, {
          bindings: [...node.bindings],
          environmentInjector: this.flowEnvironment?.() ?? undefined,
        });
      });
    });
  }
}
