import {
  inject,
  Component,
  ComponentRef,
  effect,
  input,
  inputBinding,
  untracked,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { FLOW_ENVIRONMENT } from './flow-environment';
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

  // The owning flow's environment — see `FLOW_ENVIRONMENT`; null outside a stepper.
  private readonly flowEnvironment = inject(FLOW_ENVIRONMENT, { optional: true });
  private ref: ComponentRef<unknown> | null = null;

  constructor() {
    // Mounted from an effect, not once: a chrome that swaps steps or forms reuses
    // this view with a different live control, and a frozen mount would leave the
    // previous control's field bound to the component on screen.
    effect(() => {
      const live = this.control();
      const anchor = this.anchor();
      untracked(() => {
        this.ref?.destroy();
        const ref = anchor.createComponent(live.component, {
          directives: [
            { type: FormField, bindings: [inputBinding('formField', () => live.field)] },
          ],
          bindings: [...live.bindings],
          environmentInjector: this.flowEnvironment?.() ?? undefined,
        });
        // The component's host element is the layout slot, as with form fields -
        // the classes land directly on it, no wrapper div.
        if (live.layout) {
          const el = ref.location.nativeElement as HTMLElement;
          el.className += (el.className ? ' ' : '') + live.layout;
        }
        this.ref = ref;
      });
    });
  }
}
