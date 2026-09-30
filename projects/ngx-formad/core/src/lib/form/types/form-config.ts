import { WritableSignal } from '@angular/core';
import { SchemaPathTree } from '@angular/forms/signals';
import { CUSTOM_FIELD } from 'formodel';
import { Rejected } from '../../types';
import { FormLayout } from './form-layout';
import { ErasedUi, SignalUiConfig } from './ui-nodes';

/**
 * Where a form's model comes from: a factory called for each instance, returning the value it starts from or a
 * writable signal of yours (a `linkedSignal` over an input, say) that is its model; or such a signal given as it is,
 * the model of every instance of the config.
 */
export type FormModelSource<M> = WritableSignal<M> | (() => M | WritableSignal<M>);

/** A form template as the runtime holds it: its model source, the ui by structure, an optional schema and layout overlay. */
export interface RuntimeFormConfig<M extends Record<string, unknown> = Record<string, unknown>> {
  readonly ui: ErasedUi;
  readonly layout?: FormLayout<M>;
  readonly model: FormModelSource<M>;
  schema?(p: SchemaPathTree<M>): void;
}

/** One form as authored: the template with its ui type kept, so live props come back as declared, and the components its layout placed. */
export interface FormConfig<
  M extends Record<string, unknown>,
  U extends SignalUiConfig<M> & ErasedUi = SignalUiConfig<M> & ErasedUi,
  P extends {} = {},
> extends RuntimeFormConfig<M> {
  readonly ui: U;

  readonly layout?: FormLayout<M, P>;
}

/** Every `customField()` in `U` by its path, a nested one dotted under its group or array. */
type CustomPaths<U, Prefix extends string = ''> = {
  [K in keyof U & string]: U[K] extends { readonly type: typeof CUSTOM_FIELD }
    ? `${Prefix}${K}`
    : U[K] extends { readonly controlsConfig: infer CU }
      ? CustomPaths<CU, `${Prefix}${K}.`>
      : U[K] extends { readonly itemConfig: infer IU }
        ? CustomPaths<IU, `${Prefix}${K}.`>
        : never;
}[keyof U & string];

type Nested<S extends string> = S extends `${string}.${string}` ? S : never;

type Unplaced<U, P> = Exclude<Exclude<CustomPaths<U>, Nested<CustomPaths<U>>>, keyof P>;

/** `unknown` when every `customField()` in `U` has a `control()` placement in `P`; a refusal naming the field otherwise. */
export type PlacesCustomFields<U, P> = [Nested<CustomPaths<U>>] extends [never]
  ? [Unplaced<U, P>] extends [never]
    ? unknown
    : Rejected<`customField "${Unplaced<U, P>}" has no control() placement in the layout`>
  : Rejected<`customField "${Nested<CustomPaths<U>>}" sits inside a group or an array item, where no control() can place it`>;
