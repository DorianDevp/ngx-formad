import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideStepperSuite } from 'ngx-formad';

// The whole example runs on ngx-formad's zero-dependency defaults: plain HTML
// controls in a CSS grid. `provideStepperSuite()` with no options registers
// exactly those, which is the point — the wizards render before anyone picks a
// Tailwind or Material adapter. Signal forms are zoneless, so we say so here.
export const appConfig: ApplicationConfig = {
  providers: [provideZonelessChangeDetection(), provideStepperSuite()],
};
