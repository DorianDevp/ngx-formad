import { afterNextRender, Directive, inject, input, inputBinding, ViewContainerRef } from '@angular/core';
import { FieldTree, FormField } from '@angular/forms/signals';
import { CONTROL_ADAPTER, LAYOUT_ADAPTER } from '../provide';
import { FieldConfig, extraInputsFor } from '../form-config/form-config';

// Renders a single field — as a *directive*, not a component, so it adds no host
// element of its own. Placed on an `<ng-container>`, it creates the control through
// the view container, which mounts it as a direct child of the surrounding grid:
// the control's own host element *is* the grid item, and the field's layout (a
// `colSpan`) is applied straight to it. That keeps the DOM flat — `grid › control ›
// <mat-form-field>` — instead of wrapping every field in two extra divs.
//
// We attach the native `FormField` directive rather than re-implementing it: that
// one directive two-way binds value and keeps touched/dirty/errors/disabled in
// sync, so user edits mark the field dirty natively — exactly what the
// seed-if-pristine sync gate reads.
@Directive({ selector: '[ngxFormadField]' })
export class FieldOutlet {
  /** The field tree node this control edits. */
  readonly node = input.required<FieldTree<unknown>>();
  /** The config that says which control to use and how to label it. */
  readonly config = input.required<FieldConfig>();

  private readonly vcr = inject(ViewContainerRef);
  private readonly controls = inject(CONTROL_ADAPTER);
  private readonly layoutAdapter = inject(LAYOUT_ADAPTER);

  constructor() {
    // After the anchor exists, instantiate once. The control is long-lived, so
    // there is nothing reactive to redo here — only the bindings stay live.
    afterNextRender(() => this.render());
  }

  private render(): void {
    const config = this.config();
    // Unknown kinds fall back to text so a typo or a richer-adapter-only kind
    // degrades to an input instead of throwing.
    const control = this.controls.controlFor(config.node.type) ?? this.controls.controlFor('text');
    if (!control) return;

    // Presentational inputs (label, options, input type) come from the node;
    // the field-state inputs are handled by FormField, so they are not repeated.
    const extras = extraInputsFor(config.node);
    const bindings = Object.entries(extras).map(([name, value]) => inputBinding(name, () => value));

    const ref = this.vcr.createComponent(control, {
      directives: [{ type: FormField, bindings: [inputBinding('formField', () => this.node())] }],
      bindings,
    });

    // The control's host element is the grid item, so the per-field layout lands
    // directly on it — no wrapper div.
    const item = this.layoutAdapter.item(config.layout ?? {});
    const el = ref.location.nativeElement as HTMLElement;
    if (item.class) el.className += (el.className ? ' ' : '') + item.class;
    if (item.style) {
      for (const [prop, value] of Object.entries(item.style)) el.style.setProperty(prop, value);
    }
  }
}
