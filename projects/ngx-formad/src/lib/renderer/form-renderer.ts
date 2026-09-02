import { Component, computed, input } from '@angular/core';
import { ErasedRecord } from '../builders/step-context';
import { LayoutSpec } from '../layout/layout-adapter';
import { FieldLevel, FormState } from './instantiate-form';
import { NodesView } from './nodes-view';
import { BoundOutputEffect } from './output-effect';

/** Draws one live form: the thin root that seeds the recursive `NodesView` with the top-level nodes and field tree. */
@Component({
  selector: 'ngx-formad-form',
  imports: [NodesView],
  host: { style: 'display: contents' },
  template: `<ngx-formad-nodes [nodes]="nodes()" [tree]="rootTree()" [layout]="grid()" [effects]="effects()" />`,
})
export class FormRenderer<M extends ErasedRecord = ErasedRecord> {
  readonly state = input.required<FormState<M>>();

  readonly layout = input<LayoutSpec>({});

  readonly effects = input<readonly BoundOutputEffect[]>([]);

  readonly nodes = computed(() => this.state().nodes);

  readonly grid = computed(() => {
    const declared = this.state().grid;

    return declared && Object.keys(declared).length > 0 ? declared : this.layout();
  });

  readonly rootTree = computed<FieldLevel>(() => this.state().rootForm as FieldLevel);
}
