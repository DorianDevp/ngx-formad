import {
  afterNextRender,
  Component,
  input,
  inputBinding,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { LiveControl } from '../runtime/materialize-step';

// Renders one standalone value control from its live instance. Same shape as
// `ComponentOutlet`, plus the one thing that makes it a *control*: the native
// `FormField` directive attached to the component, bound to the implicit field
// tree the step materialized — so value, touched/dirty, and errors flow between
// the component and the field with no wiring of our own (exactly how a form's
// `FieldOutlet` mounts its leaf controls). Visibility is the caller's `@if`; a
// hidden control is never instantiated, keeping it out of completion.
@Component({
  selector: 'ngx-formad-control-outlet',
  host: { style: 'display: contents' },
  template: `<ng-container #anchor />`,
})
export class ControlOutlet {
  readonly control = input.required<LiveControl>();

  private readonly anchor = viewChild.required('anchor', { read: ViewContainerRef });

  constructor() {
    afterNextRender(() => {
      const live = this.control();
      const ref = this.anchor().createComponent(live.component, {
        directives: [{ type: FormField, bindings: [inputBinding('formField', () => live.field)] }],
        bindings: [...live.bindings],
      });
      // The component's host element is the layout slot, as with form fields —
      // the classes land directly on it, no wrapper div.
      if (live.layout) {
        const el = ref.location.nativeElement as HTMLElement;
        el.className += (el.className ? ' ' : '') + live.layout;
      }
    });
  }
}
