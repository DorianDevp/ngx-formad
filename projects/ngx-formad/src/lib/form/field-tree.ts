import { untracked } from '@angular/core';
import { FieldItems, FieldLeaf, FieldLevel } from './types/field-tree';

/** Narrows a field tree to an object level from its current value, read outside any reactive context. */
export function isLevel(tree: FieldLeaf): tree is FieldLevel {
  const value = untracked(() => tree().value());

  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Narrows a field tree to a repeating group's items from its current value, read outside any reactive context. */
export function isItems(tree: FieldLeaf): tree is FieldItems {
  return Array.isArray(untracked(() => tree().value()));
}
