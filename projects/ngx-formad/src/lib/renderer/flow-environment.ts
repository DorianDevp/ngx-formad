import { EnvironmentInjector, InjectionToken } from '@angular/core';

/** A getter for the active flow's environment injector, so dynamically created components resolve what the flow provided. */
export const FLOW_ENVIRONMENT = new InjectionToken<() => EnvironmentInjector | null>(
  'ngx-formad.flow-environment',
);
