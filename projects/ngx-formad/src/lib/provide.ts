import { InjectionToken, Provider, Type } from '@angular/core';
import { ControlAdapter } from './controls/control-adapter';
import { defaultControls } from './controls/default-control-adapter';
import { LayoutAdapter } from './layout/layout-adapter';
import { cssLayout } from './layout/css-layout';

/** Control kind → its `FormValueControl` component, as a registry stores it. */
export type ControlTypeMap = Record<string, Type<object>>;

/** The active control registry (kind → component). */
export const CONTROL_ADAPTER = new InjectionToken<ControlAdapter>('ngx-formad.controls', {
  providedIn: 'root',
  factory: () => defaultControls,
});

/** The active layout adapter (spec → classes or styles). */
export const LAYOUT_ADAPTER = new InjectionToken<LayoutAdapter>('ngx-formad.layout', {
  providedIn: 'root',
  factory: () => cssLayout,
});

/** The active stepper chrome; `null` selects the bundled default. */
export const STEPPER_ADAPTER = new InjectionToken<Type<object> | null>('ngx-formad.stepper', {
  providedIn: 'root',
  factory: () => null,
});

/** The three adapter axes; an omitted axis keeps its default. */
export interface FormadSuiteOptions {
  readonly controls?: ControlAdapter;

  readonly controlTypes?: ControlTypeMap;

  readonly layout?: LayoutAdapter;

  readonly stepper?: Type<object>;
}

function withControlTypes(base: ControlAdapter, types: ControlTypeMap): ControlAdapter {
  return {
    controlFor: (kind) => (Object.hasOwn(types, kind) ? types[kind] : base.controlFor(kind)),
  };
}

/** Registers the chosen adapters once, at the application providers level. */
export function provideFormadSuite(options: FormadSuiteOptions = {}): Provider[] {
  const providers: Provider[] = [];
  if (options.controls || options.controlTypes) {
    const base = options.controls ?? defaultControls;
    const adapter = options.controlTypes ? withControlTypes(base, options.controlTypes) : base;
    providers.push({ provide: CONTROL_ADAPTER, useValue: adapter });
  }
  if (options.layout) {
    providers.push({ provide: LAYOUT_ADAPTER, useValue: options.layout });
  }
  if (options.stepper) {
    providers.push({ provide: STEPPER_ADAPTER, useValue: options.stepper });
  }
  return providers;
}
