import { Binding, InputSignal, inputBinding, OutputEmitterRef, outputBinding } from '@angular/core';
import { Live, read } from '../form-config/live';

/** The keys of `C` that are signal inputs. */
export type InputKeys<C> = {
  [K in keyof C]: C[K] extends InputSignal<infer _V> ? K : never;
}[keyof C];

/** The keys of `C` that are output emitters. */
export type OutputKeys<C> = {
  [K in keyof C]: C[K] extends OutputEmitterRef<infer _V> ? K : never;
}[keyof C];

/** The value type of input `K` of `C`. */
export type InputVal<C, K extends keyof C> = C[K] extends InputSignal<infer V> ? V : never;

/** The event type of output `K` of `C`. */
export type OutputVal<C, K extends keyof C> = C[K] extends OutputEmitterRef<infer V> ? V : never;

/** The inputs a dynamic component may receive, each possibly live. */
export type ComponentInputs<C> = { readonly [K in InputKeys<C>]?: Live<InputVal<C, K>> };

/** The output handlers a dynamic component may receive. */
export type ComponentOutputs<C> = { readonly [K in OutputKeys<C>]?: (event: OutputVal<C, K>) => void };

/** Inputs, output handlers, visibility and layout class for one dynamic component. */
export interface ComponentCfg<C> {
  readonly inputs?: ComponentInputs<C>;

  readonly outputs?: ComponentOutputs<C>;

  readonly visibleWhen?: () => boolean;

  readonly layout?: string;
}

/** Normalizes a component config into the bindings `createComponent` takes. */
export function toBindings<C, I extends ComponentInputs<C>, O extends ComponentOutputs<C>>(
  cfg: ComponentCfg<C> & { readonly inputs?: I; readonly outputs?: O },
): Binding[] {
  const bindings: Binding[] = [];
  const inputs: I | undefined = cfg.inputs;
  const outputs: O | undefined = cfg.outputs;
  if (inputs) {
    for (const name in inputs) {
      const value = inputs[name];
      if (value === undefined) continue;

      bindings.push(inputBinding(name, () => read(value)));
    }
  }
  if (outputs) {
    for (const name in outputs) {
      const handler = outputs[name];
      if (handler !== undefined) bindings.push(outputBinding(name, handler));
    }
  }

  return bindings;
}
