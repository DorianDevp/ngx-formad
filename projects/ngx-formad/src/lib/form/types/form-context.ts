import { WritableSignal } from '@angular/core';
import { GridPlacement } from '../../layout';
import { FieldComponentConfig } from './component-config';
import { FieldNode } from './ui-nodes';

/**
 * What a callback inside one form reads: its writable model, its authored ui and its placed fields. Inside a stepper
 * the object also carries the step's context, which the placement (`addForm`) types.
 */
export interface FormContext<M extends Record<string, unknown> = Record<string, unknown>, U = any> {
  readonly model: WritableSignal<M>;

  readonly ui: U;

  readonly fields: readonly FieldConfig[];
}

/** One scalar field ready to render: its key, path from the form root, node, placement and chosen control. */
export interface FieldConfig {
  readonly key: string;

  readonly path: readonly string[];

  readonly node: FieldNode;

  readonly layout?: GridPlacement;

  readonly control?: FieldComponentConfig<any, object>;
}
