import { Type } from '@angular/core';
import { ControlAdapter } from 'ngx-formad/core';
import {
  CheckboxControl,
  DateControl,
  FileControl,
  NumberControl,
  SelectControl,
  TextControl,
  TextareaControl,
} from './default-controls';

const registry: Readonly<Record<string, Type<object>>> = {
  text: TextControl,
  email: TextControl,
  password: TextControl,
  tel: TextControl,
  url: TextControl,
  textarea: TextareaControl,
  number: NumberControl,
  select: SelectControl,
  radio: SelectControl,
  checkbox: CheckboxControl,
  date: DateControl,
  file: FileControl,
};

/** The zero-dependency control registry over the plain-HTML controls; an unknown kind resolves to `null`. */
export const defaultControls: ControlAdapter = {
  controlFor: (kind) => (Object.hasOwn(registry, kind) ? registry[kind] : null),
};
