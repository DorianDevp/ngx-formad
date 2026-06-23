import {
  afterNextRender,
  Component,
  inject,
  input,
  inputBinding,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { FieldTree, FormField } from '@angular/forms/signals';
import { CONTROL_ADAPTER } from '../provide';
import { FieldConfig, extraInputsFor } from '../form-config/form-config';

// Renders a single field. This is the dynamic-render equivalent of writing
// `<some-control [formField]="node" [label]="…" />` by hand, except the control
// type and inputs come from config. We attach the native `FormField` directive
// rather than re-implementing it: that one directive two-way binds value and
// keeps touched/dirty/errors/disabled in sync, so user edits mark the field
// dirty natively — which is exactly what the seed-if-pristine sync gate reads.
@Component({
  selector: 'ngx-formad-field-outlet',
  template: `<ng-container #anchor />`,
})
export class FieldOutlet {
  /** The field tree node this control edits. */
  readonly node = input.required<FieldTree<unknown>>();
  /** The config that says which control to use and how to label it. */
  readonly config = input.required<FieldConfig>();

  private readonly anchor = viewChild.required('anchor', { read: ViewContainerRef });
  private readonly controls = inject(CONTROL_ADAPTER);

  constructor() {
    // After the anchor exists, instantiate once. The control is long-lived, so
    // there is nothing reactive to redo here — only the bindings stay live.
    afterNextRender(() => this.render());
  }

  private render(): void {
    const kind = this.config().node.type;
    // Unknown kinds fall back to text so a typo or a richer-adapter-only kind
    // degrades to an input instead of throwing.
    const control = this.controls.controlFor(kind) ?? this.controls.controlFor('text');
    if (!control) return;

    // Presentational inputs (label, options, input type) come from the node;
    // the field-state inputs are handled by FormField, so they are not repeated.
    const extras = extraInputsFor(this.config().node);
    const bindings = Object.entries(extras).map(([name, value]) => inputBinding(name, () => value));

    this.anchor().createComponent(control, {
      directives: [{ type: FormField, bindings: [inputBinding('formField', () => this.node())] }],
      bindings,
    });
  }
}
