import { FieldTree } from '@angular/forms/signals';

/** A field tree over an object value: its children are reachable by model key. */
export type FieldLevel<M extends Record<string, unknown> = Record<string, unknown>> = FieldTree<M>;

/** A field tree over one value, as a formField is bound to it. */
export type FieldLeaf<V = unknown> = FieldTree<V>;

/** A field tree over an array value: its items are reachable by index. */
export type FieldItems<V = unknown> = FieldTree<V[]>;
