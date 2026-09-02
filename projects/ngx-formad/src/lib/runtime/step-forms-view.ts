import { Component, computed, inject, input } from '@angular/core';
import { FLOW_ENVIRONMENT } from '../renderer/flow-environment';
import { FormRenderer } from '../renderer/form-renderer';
import { LiveStep } from './materialize-step';

/** Draws a live step's visible forms; a chrome drops it into an `@defer` block or renders it eagerly. */
@Component({
  providers: [
    {
      provide: FLOW_ENVIRONMENT,
      useFactory: () => {
        const view = inject(StepFormsView);

        return () => view.step().environment;
      },
    },
  ],
  selector: 'ngx-formad-step-forms',
  imports: [FormRenderer],
  template: `
    @for (form of visibleForms(); track form.name) {
      <ngx-formad-form [state]="form.state" [effects]="form.effects" />
    }
  `,
})
export class StepFormsView {
  readonly step = input.required<LiveStep>();

  readonly visibleForms = computed(() => this.step().forms.filter((form) => form.visible()));
}
