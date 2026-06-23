import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideFormadSuite } from 'ngx-formad';

// The whole example runs on ngx-formad's zero-dependency defaults: plain HTML
// controls in a CSS grid, and the bundled stepper chrome. `provideFormadSuite()`
// with no options registers exactly those, which is the point — the wizards
// render before anyone picks a Tailwind, Material, or custom-chrome adapter.
// Signal forms are zoneless, so we say so here.
export const appConfig: ApplicationConfig = {
  providers: [provideZonelessChangeDetection(), provideFormadSuite()],
};
