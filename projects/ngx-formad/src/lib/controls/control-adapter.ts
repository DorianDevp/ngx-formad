import { Type } from '@angular/core';

/** Resolves a field's control kind to its `FormValueControl` component; `null` lets the renderer fall back to text. */
export interface ControlAdapter {
  controlFor(kind: string): Type<object> | null;
}
