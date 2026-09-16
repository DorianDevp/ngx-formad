import { TestBed } from '@angular/core/testing';
import { provideFormadSuite } from 'ngx-formad/core';
import { DefaultStepperChrome } from 'ngx-formad/chrome';
import { defaultControls } from 'ngx-formad/template';

// Every spec starts the way an application that imports the secondary entry points does: the plain-HTML formFields
// and the bundled chrome. A spec that provides an adapter of its own overrides these, since a later provider wins.
// The entry points resolve to source here (tsconfig.spec.json `paths`), so no build has to run before the specs.
beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [provideFormadSuite({ controls: defaultControls, stepper: DefaultStepperChrome })],
  });
});
