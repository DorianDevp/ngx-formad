import { Component, input } from '@angular/core';
import { FormRenderer } from '../renderer/form-renderer';
import { LiveStep } from './materialize-step';

// Renders one live step's forms. Split out so any chrome can drop it into an
// `@defer` block (or render it eagerly) in a single line, without re-deriving the
// form loop.
@Component({
  selector: 'ngx-formad-step-forms',
  imports: [FormRenderer],
  template: `
    @for (form of step().forms; track form.name) {
      <ngx-formad-form [state]="form.state" />
    }
  `,
})
export class StepFormsView {
  readonly step = input.required<LiveStep>();
}
