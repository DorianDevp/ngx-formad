import { Type } from '@angular/core';
import { ControlAdapter } from 'ngx-formad';
import {
  MatCheckboxControl,
  MatDateControl,
  MatFileControl,
  MatNumberControl,
  MatSelectControl,
  MatTextControl,
  MatTextareaControl,
} from './material-controls';

const registry: Readonly<Record<string, Type<object>>> = {
  text: MatTextControl,
  email: MatTextControl,
  password: MatTextControl,
  tel: MatTextControl,
  url: MatTextControl,
  textarea: MatTextareaControl,
  number: MatNumberControl,
  select: MatSelectControl,
  radio: MatSelectControl,
  checkbox: MatCheckboxControl,
  date: MatDateControl,
  file: MatFileControl,
};

/** The Angular Material control adapter; an unknown kind resolves to `null`, so the renderer falls back to text. */
export const materialControls: ControlAdapter = {
  controlFor: (kind) => (Object.hasOwn(registry, kind) ? registry[kind] : null),
};
