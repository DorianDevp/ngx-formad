import { Component, computed, input } from '@angular/core';
import { FormRenderer } from '../../form';
import { LiveStep } from '../types/live-step';

/** Draws a live step's visible forms; a chrome drops it into an `@defer` block or renders it eagerly. */
@Component({
  selector: 'ngx-formad-step-forms',
  imports: [FormRenderer],
  template: `
    @for (form of visibleForms(); track form.name) {
      <ngx-formad-form [state]="form.state" />
    }
  `,
})
export class StepFormsView {
  readonly step = input.required<LiveStep>();

  readonly visibleForms = computed(() => this.step().forms.filter((form) => form.visible()));
}
