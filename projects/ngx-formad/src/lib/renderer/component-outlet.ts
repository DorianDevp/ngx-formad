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

/** Mounts one dynamic component from its node, following the node when the host swaps it. */
@Component({
  selector: 'ngx-formad-component-outlet',
  host: { style: 'display: contents' },
  template: `<ng-container #anchor />`,
})
export class ComponentOutlet {
  readonly node = input.required<ComponentNode>();

  private readonly anchor = viewChild.required('anchor', { read: ViewContainerRef });

  private readonly flowEnvironment = inject(FLOW_ENVIRONMENT, { optional: true });

  private ref: ComponentRef<object> | null = null;

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
