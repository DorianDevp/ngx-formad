import { Component } from '@angular/core';

/** Shows a component created when its form or step was instantiated: `NgComponentOutlet` projects the host element here. */
@Component({
  selector: 'ngx-formad-slot',
  host: { style: 'display: contents' },
  template: '<ng-content />',
})
export class FormadSlot {}
