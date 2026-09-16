import { InjectionToken } from '@angular/core';
import { ControlAdapter } from './types/control-adapter';

const NO_CONTROLS =
  "no formField registry is provided; provideFormadSuite({ controls: defaultControls }) from 'ngx-formad/template', " +
  "materialControls from 'ngx-formad/material', or a ControlAdapter of your own";

/** The registry an application has until it provides one: every kind is refused, with the fix in the message. */
export const noControls: ControlAdapter = {
  controlFor: () => {
    throw new Error(`ngx-formad: ${NO_CONTROLS}.`);
  },
};

/** The active control registry (kind → component). */
export const CONTROL_ADAPTER = new InjectionToken<ControlAdapter>('ngx-formad.controls', {
  providedIn: 'root',
  factory: () => noControls,
});
