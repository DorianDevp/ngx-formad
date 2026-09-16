import { SelectFormControlNode } from 'formodel';

/** An option as the select and radio controls consume it. */
export interface ControlOption {
  readonly value: SelectFormControlNode['options'][number]['value'];

  readonly label: string;
}
