import { InjectionToken } from '@angular/core';
import { defaultControls } from './default-control-adapter';
import { ControlAdapter } from './types/control-adapter';

/** The active control registry (kind → component). */
export const CONTROL_ADAPTER = new InjectionToken<ControlAdapter>('ngx-formad.controls', {
  providedIn: 'root',
  factory: () => defaultControls,
});
