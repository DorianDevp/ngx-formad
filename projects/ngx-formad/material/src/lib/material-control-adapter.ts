import { Type } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { ControlAdapter } from 'ngx-formad';
import {
  MatCheckboxControl,
  MatNumberControl,
  MatSelectControl,
  MatTextControl,
  MatTextareaControl,
} from './material-controls';

// The kinds map onto formodel's control `type` discriminant, exactly as the core
// default adapter does — the five text-like kinds share one component; `radio`
// reuses the select for now. Drop this into `provideFormadSuite({ controls:
// materialControls })` and every form renders with Angular Material, no change to
// any form config or layout.
const registry: Record<string, Type<FormValueControl<unknown>>> = {
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
} as Record<string, Type<FormValueControl<unknown>>>;

/** An Angular Material control adapter. Unknown kinds return null so the renderer
 *  falls back to its text control — the same contract as the default adapter. */
export const materialControls: ControlAdapter = {
  controlFor: (kind) => registry[kind] ?? null,
};
