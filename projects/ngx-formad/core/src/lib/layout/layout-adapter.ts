import { InjectionToken } from '@angular/core';
import { cssLayout } from './css-layout';
import { LayoutAdapter, Responsive } from './types/layout';

/** Normalizes a responsive number into `[breakpoint, value]` pairs, `base` first. */
export function responsiveEntries(value: Responsive<number> | null | undefined): [string, number][] {
  if (value == null) return [];
  if (typeof value === 'number') return [['base', value]];

  const entries = Object.entries(value).filter((entry): entry is [string, number] => entry[1] != null);

  return entries.sort(([a], [b]) => (a === 'base' ? -1 : b === 'base' ? 1 : 0));
}

/** The active layout adapter (spec → classes or styles). */
export const LAYOUT_ADAPTER = new InjectionToken<LayoutAdapter>('ngx-formad.layout', {
  providedIn: 'root',
  factory: () => cssLayout,
});
