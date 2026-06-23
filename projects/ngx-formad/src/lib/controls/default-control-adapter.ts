import { Type } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { ControlAdapter } from './control-adapter';
import {
  CheckboxControl,
  NumberControl,
  SelectControl,
  TextControl,
  TextareaControl,
} from './default-controls';

// The kinds map onto formodel's control `type` discriminant. The four text-like
// kinds share one component (it only varies the native input `type`), which the
// renderer passes through from the node. 'radio' reuses the select control for
// now — a dedicated radio component is a later addition, not a contract change.
const registry: Record<string, Type<FormValueControl<unknown>>> = {
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
} as Record<string, Type<FormValueControl<unknown>>>;

// The zero-dependency control registry. Unknown kinds return null so the
// renderer can fall back to text rather than blow up on a typo or a kind only a
// richer adapter (date pickers, file uploads) knows how to render.
export const defaultControls: ControlAdapter = {
  controlFor: (kind) => registry[kind] ?? null,
};
