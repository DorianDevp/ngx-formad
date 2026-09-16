import { Type } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { GridPlacement } from '../../layout';

type ComponentType<T> = T extends object ? T extends (...args: any) => any ? never : T & Type<T> : never;

/** A component placed on a field of value `T` by `formLayout().control()`: its class and its placement; its bindings are declared where the form is instantiated. */
export interface ComponentConfig<T = any> {
  readonly component: ComponentType<T>

  readonly placement?: GridPlacement;
}

/** A component placed on a field of value `T` by `formLayout().control()`: its class and its placement; its bindings are declared where the form is instantiated. */
export interface FieldComponentConfig<T = any, C extends object = FormValueControl<T>> {
  readonly component: Type<C> & Type<FormValueControl<T>>;

  readonly placement?: GridPlacement;
}
