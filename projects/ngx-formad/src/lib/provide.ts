import { InjectionToken, Provider, Type } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { ControlAdapter } from './controls/control-adapter';
import { defaultControls } from './controls/default-control-adapter';
import { LayoutAdapter } from './layout/layout-adapter';
import { cssLayout } from './layout/css-layout';

/** A map of control kind → its component, for registering custom widgets. The
 *  value type is left open so a `FormValueControl<Device[]>` registers without a
 *  cast (the registry only instantiates the component; the field binds the value). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ControlTypeMap = Record<string, Type<FormValueControl<any>>>;

// The three adapter axes are configured once, here, and read through DI. Controls
// and layout have zero-dependency defaults, so the suite renders out of the box;
// the stepper chrome defaults to `null` and the shell falls back to its bundled
// chrome (the import lives in the shell, not here, to keep this provider free of
// the component graph). A consumer overrides any axis without touching the others.

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

/** The active stepper chrome (a component taking a `controller` input). `null`
 *  means "use the bundled default chrome", resolved in the shell to avoid a
 *  provider→component import cycle. */
export const STEPPER_ADAPTER = new InjectionToken<Type<unknown> | null>('ngx-formad.stepper', {
  providedIn: 'root',
  factory: () => null,
});

/** Options for {@link provideFormadSuite}; omit an axis to keep its default. */
export interface FormadSuiteOptions {
  readonly controls?: ControlAdapter;
  /** Custom control kinds (from `customInputType`), layered over `controls`/the
   *  defaults — `controlFor` resolves these first, so a kind here also overrides a
   *  built-in of the same name. */
  readonly controlTypes?: ControlTypeMap;
  readonly layout?: LayoutAdapter;
  /** A chrome component for the stepper; its only input is `controller`. */
  readonly stepper?: Type<unknown>;
}

// Layers a custom kind→component map over a base adapter: registered kinds win,
// everything else falls through to the base (and its text fallback).
function withControlTypes(base: ControlAdapter, types: ControlTypeMap): ControlAdapter {
  return {
    controlFor: (kind) =>
      (types[kind] as Type<FormValueControl<unknown>> | undefined) ?? base.controlFor(kind),
  };
}

/**
 * Registers the chosen adapters. Call once at the application providers level.
 * With no options it still works — plain HTML controls in a CSS grid, the bundled
 * stepper chrome — so this is safe to call before picking Tailwind, Material, or a
 * custom shell.
 */
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
