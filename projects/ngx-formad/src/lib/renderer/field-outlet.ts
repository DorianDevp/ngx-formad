import {
  ComponentRef,
  Directive,
  effect,
  inject,
  input,
  inputBinding,
  outputBinding,
  untracked,
  ViewContainerRef,
} from '@angular/core';
import { FieldTree, FormField } from '@angular/forms/signals';
import { CONTROL_ADAPTER, LAYOUT_ADAPTER } from '../provide';
import { applyLayoutClasses } from '../layout/layout-adapter';
import { FieldConfig, extraInputsFor } from '../form-config/form-config';
import { readReactive } from '../form-config/reactive';
import { BoundOutputEffect, samePath } from './output-effect';

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
  /** All of the form's control-output effects; this field wires the ones at its path. */
  readonly effects = input<readonly BoundOutputEffect[]>([]);

  private readonly vcr = inject(ViewContainerRef);
  private readonly controls = inject(CONTROL_ADAPTER);
  private readonly layoutAdapter = inject(LAYOUT_ADAPTER);

  private ref: ComponentRef<unknown> | null = null;

  constructor() {
    // Re-rendered when the *config* changes, not once: the grid iterates nodes with
    // `track node.key`, so a form swapped for another whose field sits at the same
    // key reuses this directive with a new config - and a frozen mount would keep
    // the old label, options, and even the old control kind. Values stay live on
    // their own: `node` is read through a getter binding.
    effect(() => {
      const config = this.config();
      untracked(() => {
        this.ref?.destroy();
        this.ref = this.render(config);
      });
    });
  }

  private render(config: FieldConfig): ComponentRef<unknown> | null {
    // Unknown kinds fall back to text so a typo or a richer-adapter-only kind
    // degrades to an input instead of throwing.
    const control = this.controls.controlFor(config.node.type) ?? this.controls.controlFor('text');
    if (!control) return null;

    // Presentational inputs (label, options, input type) come from the node;
    // the field-state inputs are handled by FormField, so they are not repeated.
    // Each binding reads through `readReactive`: a static prop passes through, a
    // signal-authored one is unwrapped *inside* the getter — which is what keeps
    // the input live when the config's signal is set after instantiation.
    const extras = extraInputsFor(config.node);
    const bindings = Object.entries(extras).map(([name, value]) =>
      inputBinding(name, () => readReactive(value)),
    );

    // Wire this field's control-output effects (e.g. a VAT-ID field's `resolved`).
    for (const effect of this.effects()) {
      if (samePath(effect.path, config.path)) {
        bindings.push(outputBinding(effect.output, (payload: unknown) => effect.run(payload)));
      }
    }

    const ref = this.vcr.createComponent(control, {
      directives: [{ type: FormField, bindings: [inputBinding('formField', () => this.node())] }],
      bindings,
    });

    // The control's host element is the grid item, so the per-field layout lands
    // directly on it - no wrapper div. Both halves of the adapter's answer have to
    // be applied: the CSS-grid default returns styles only, and writing those with
    // their camel-case names straight into CSSOM does nothing at all.
    const item = this.layoutAdapter.item(config.layout ?? {});
    applyLayoutClasses(ref.location.nativeElement as HTMLElement, item);

    return ref;
  }
}
