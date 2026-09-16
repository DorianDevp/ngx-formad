import { Provider, Type } from '@angular/core';
import { CONTROL_ADAPTER, ControlAdapter, ControlTypeMap, defaultControls } from './controls';
import { LAYOUT_ADAPTER, LayoutAdapter } from './layout';
import { STEPPER_ADAPTER } from './stepper';

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
