import { Component, input } from '@angular/core';
import { NodesView } from './nodes-view';
import { FormState } from './types/form-state';

/** Draws one live form: the thin root that hands the form's view to the recursive `NodesView`. */
@Component({
  selector: 'ngx-formad-form',
  imports: [NodesView],
  host: { style: 'display: contents' },
  template: `<ngx-formad-nodes [level]="state().view" />`,
})
export class FormRenderer {
  readonly state = input.required<FormState>();
}
