import { FormConfig, PlacesCustomFields } from './types/form-config';
import { ErasedUi, SignalUiConfig } from './types/ui-nodes';

/** Declares a form config while keeping the authored `ui` type and the placed components, so a signal put in comes back writable and the bindings are typed. */
export function defineForm<M extends Record<string, unknown>, U extends SignalUiConfig<M> & ErasedUi, P extends {} = {}>(
  config: FormConfig<M, U, P> & PlacesCustomFields<U, P>,
): FormConfig<M, U, P> {
  return config;
}
