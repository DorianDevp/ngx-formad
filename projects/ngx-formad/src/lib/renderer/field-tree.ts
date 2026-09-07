import { untracked } from '@angular/core';
import { FieldTree } from '@angular/forms/signals';

/** A field tree over an object value: its children are reachable by model key. */
export type FieldLevel<M extends Record<string, unknown> = Record<string, unknown>> = FieldTree<M>;

/** A field tree over one value, as a formField is bound to it. */
export type FieldLeaf<V = unknown> = FieldTree<V>;

/** A field tree over an array value: its items are reachable by index. */
export type FieldItems<V = unknown> = FieldTree<V[]>;

/** Narrows a field tree to an object level from its current value, read outside any reactive context. */
export function isLevel(tree: FieldLeaf): tree is FieldLevel {
  const value = untracked(() => tree().value());

  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Narrows a field tree to a repeating group's items from its current value, read outside any reactive context. */
export function isItems(tree: FieldLeaf): tree is FieldItems {
  return Array.isArray(untracked(() => tree().value()));
}
