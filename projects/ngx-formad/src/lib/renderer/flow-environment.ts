import { EnvironmentInjector, InjectionToken } from '@angular/core';

// The flow's own injection environment, published where a step's view renders so
// every dynamically created component below — a page component, a standalone
// control, a form layout component, a native control — resolves the providers the
// flow declared with `provide(...)` on its builder. A getter, not a value: one
// static provider serves a view whose active step (and owning flow) changes.
export const FLOW_ENVIRONMENT = new InjectionToken<() => EnvironmentInjector | null>(
  'ngx-formad.flow-environment',
);
