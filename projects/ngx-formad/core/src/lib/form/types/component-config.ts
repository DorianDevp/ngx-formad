import { Binding, Type } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { GridPlacement } from '../../layout';
import { FormContext } from './form-context';

/**
 * A component placed between the fields by `formLayout().component()`: its class, its bindings over the form context
 * and its placement. `bindings` runs once, at mount; a getter inside a binding is what keeps an input live.
 */
export interface ComponentConfig<M extends Record<string, unknown> = Record<string, unknown>> {
  readonly component: Type<object>;
  bindings?(ctx: FormContext<M>): readonly Binding[];
  readonly placement?: GridPlacement;
}

/** A component placed on a field of value `T` by `formLayout().control()`: its class and its placement; its bindings are declared where the form is instantiated. */
export interface FieldComponentConfig<T = any, C extends object = FormValueControl<T>> {
  readonly component: Type<C> & Type<FormValueControl<T>>;
  readonly placement?: GridPlacement;
}
