import { Type } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';

// A control is any component implementing the native `FormValueControl`
// contract — a `value = model<T>()` plus optional state inputs. The adapter is
// nothing more than a registry from a field's declared kind (formodel's control
// `type`: 'text', 'select', …) to such a component. Swapping Material for plain
// HTML is swapping this one object; the renderer never changes.
export interface ControlAdapter {
  // Returns the component for a kind, or null when the kind is unknown so the
  // renderer can fall back to its text control rather than throwing.
  controlFor(kind: string): Type<FormValueControl<unknown>> | null;
}
