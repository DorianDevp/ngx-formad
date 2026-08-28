import { Type } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { ControlAdapter } from './control-adapter';
import {
  CheckboxControl,
  DateControl,
  FileControl,
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
  date: DateControl,
  file: FileControl,
} as Record<string, Type<FormValueControl<unknown>>>;

// The zero-dependency control registry. Unknown kinds return null so the
// renderer can fall back to text rather than blow up on a typo - and the lookup is
// own-property only, or a kind named after something on `Object.prototype`
// ('constructor', 'toString') would resolve to that instead of returning null.
export const defaultControls: ControlAdapter = {
  controlFor: (kind) => (Object.hasOwn(registry, kind) ? registry[kind] : null),
};
