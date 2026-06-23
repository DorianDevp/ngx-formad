import { InjectionToken, Provider } from '@angular/core';
import { ControlAdapter } from './controls/control-adapter';
import { defaultControls } from './controls/default-control-adapter';
import { LayoutAdapter } from './layout/layout-adapter';
import { cssLayout } from './layout/css-layout';

// The two adapter axes are configured once, here, and read by the renderer
// through DI. Both have zero-dependency defaults, so the suite renders out of
// the box; a consumer overrides one axis without touching the other.

/** The active control registry (kind -> native control component). */
export const CONTROL_ADAPTER = new InjectionToken<ControlAdapter>('ngx-formad.controls', {
  providedIn: 'root',
  factory: () => defaultControls,
});

/** The active layout adapter (spec -> classes/styles). */
export const LAYOUT_ADAPTER = new InjectionToken<LayoutAdapter>('ngx-formad.layout', {
  providedIn: 'root',
  factory: () => cssLayout,
});

/** Options for {@link provideStepperSuite}; omit an axis to keep its default. */
export interface StepperSuiteOptions {
  readonly controls?: ControlAdapter;
  readonly layout?: LayoutAdapter;
}

/**
 * Registers the chosen adapters. Call once at the application providers level.
 * With no options it still works — defaults are plain HTML controls in a CSS
 * grid — so this is safe to call even before picking Tailwind or Material.
 */
export function provideStepperSuite(options: StepperSuiteOptions = {}): Provider[] {
  const providers: Provider[] = [];
  if (options.controls) {
    providers.push({ provide: CONTROL_ADAPTER, useValue: options.controls });
  }
  if (options.layout) {
    providers.push({ provide: LAYOUT_ADAPTER, useValue: options.layout });
  }
  return providers;
}
