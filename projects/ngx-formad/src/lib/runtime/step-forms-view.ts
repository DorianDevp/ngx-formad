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
      <!-- Same two things the page renderer does: a form hidden by its own
           visibleWhen is out of the completion fold, so drawing it here would put
           an uncountable form on screen - and a form's control-output effects (a
           VAT-ID field filling in its siblings) only run if they are handed down. -->
      @if (form.visible()) {
        <ngx-formad-form [state]="form.state" [effects]="form.effects" />
      }
    }
  `,
})
export class StepFormsView {
  readonly step = input.required<LiveStep>();
}
