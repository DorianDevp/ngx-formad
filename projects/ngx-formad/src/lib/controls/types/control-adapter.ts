import { Type } from '@angular/core';

/** Resolves a field's control kind to its `FormValueControl` component; `null` lets the renderer fall back to text. */
export interface ControlAdapter {
  controlFor(kind: string): Type<object> | null;
}

/** Control kind → its `FormValueControl` component, as a registry stores it. */
export type ControlTypeMap = Record<string, Type<object>>;
