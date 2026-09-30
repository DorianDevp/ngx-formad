import { EnvironmentInjector, Injector, WritableSignal } from '@angular/core';
import { GridLayout } from '../../layout';
import { FieldLevel } from './field-tree';
import { BindingRecord, FormEffectHook } from './form-bindings';
import { FieldConfig } from './form-context';
import { FormLevel } from './form-view';
import { RenderNode } from './render-tree';
import { ErasedUi } from './ui-nodes';

/** A live form: its model signal, the field tree, the authored ui, the render tree and leaves, and the view built over them. */
export interface FormState<
  M extends Record<string, unknown> = Record<string, unknown>,
  U extends ErasedUi = ErasedUi,
> {
  readonly model: WritableSignal<M>;

  readonly rootForm: FieldLevel;

  readonly ui: U;

  readonly nodes: readonly RenderNode[];

  readonly fields: readonly FieldConfig[];

  readonly grid?: GridLayout;

  readonly view: FormLevel;

  /** Ends the form's effects; a host whose injector outlives the instance calls it when the instance goes. */
  destroy(): void;
}

/** What a form is instantiated with beyond its config: the injectors its formFields see, its bindings and effects, and the context they read. */
export interface InstantiateOptions {
  readonly injector?: Injector;
  /** The environment the formFields are created in; absent, the one `injector` resolves. A stepper hands its flow's. */
  readonly environment?: EnvironmentInjector;
  readonly bindings?: BindingRecord;

  readonly effects?: readonly FormEffectHook[];

  /** What a handler and an effect read beside the model; a getter is read again on every call, so a step context stays live. */
  readonly context?: () => object;
}
