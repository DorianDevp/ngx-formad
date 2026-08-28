// The layout axis is orthogonal to controls: it only decides how a cluster of
// fields is arranged, never how a single field renders. An adapter turns a
// declarative spec into the two things a template can apply — a class string or
// an inline style map — so the renderer stays ignorant of Tailwind vs raw CSS.

// Breakpoint NAMES are the consumer's to define (in the shipped `ngx-formad/styles`
// via `@use ... with ($breakpoints: (...))`); the adapter only echoes whichever
// name a spec uses into a class. Waterfalling — a value set at one breakpoint
// applying to every wider one until overridden — is a property of the CSS: the
// stylesheet emits mobile-first `min-width` media queries in ascending order, so
// `md: 2` keeps applying at `lg`/`xl`. Nothing here needs to fill the gaps.

/** A responsive breakpoint key. `base` is the no-media-query default; the common
 *  `sm/md/lg/xl` are suggested for autocomplete, but any consumer-defined name works. */
export type Breakpoint = 'base' | 'sm' | 'md' | 'lg' | 'xl' | (string & {});

/** A value that is either constant across breakpoints, or varies per breakpoint.
 *  `{ base: 1, md: 2 }` = one column, two from `md` up. A bare `2` = two always. */
export type Responsive<T> = T | Partial<Record<Breakpoint, T>>;

/** Normalizes a `Responsive<T>` into `[breakpoint, value]` pairs — `base` first,
 *  other keys in author order — so an adapter can map each to a (possibly
 *  breakpoint-prefixed) class. Waterfalling is left to the CSS, not synthesized here. */
export function responsiveEntries<T>(value: Responsive<T> | undefined): [string, T][] {
  if (value == null) return [];
  if (typeof value !== 'object') return [['base', value]];
  const entries = Object.entries(value as Record<string, T>).filter(([, v]) => v != null);
  return entries.sort(([a], [b]) => (a === 'base' ? -1 : b === 'base' ? 1 : 0)) as [string, T][];
}

/** How a container arranges its children. */
export interface LayoutSpec {
  /** Number of grid columns, constant or per-breakpoint. Defaults to 1. */
  readonly cols?: Responsive<number>;
  /** Gap between cells, in 0.25rem steps (Tailwind's spacing scale). */
  readonly gap?: number;
}

/** How a single child sits inside its container. */
export interface ItemSpec {
  /** Columns this item spans, constant or per-breakpoint. Omitted = one column. */
  readonly colSpan?: Responsive<number>;
  /** The column this item starts at (1-based), constant or per-breakpoint. */
  readonly colStart?: Responsive<number>;
}

/** What an adapter hands back for one element: a class, a style map, or both. */
export interface LayoutClasses {
  readonly class?: string;
  readonly style?: Record<string, string>;
}

/** Resolves layout specs into classes/styles. Swapped once via the provider. */
export interface LayoutAdapter {
  container(spec: LayoutSpec): LayoutClasses;
  item(spec: ItemSpec): LayoutClasses;
}

// CSSOM's `setProperty` takes hyphenated property names only - handed `gridColumn`
// it looks up `gridcolumn`, finds nothing, and returns without throwing. Adapters
// author their style maps the way Angular's `[style]` binding accepts them (camel
// case), so anything applying one by hand has to convert first. Custom properties
// (`--x`) are passed through untouched.
export function cssPropertyName(property: string): string {
  return property.startsWith('--')
    ? property
    : property.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

/** Puts one resolved `LayoutClasses` on an element: its classes appended to what
 *  is already there, its styles set inline. The single place a layout lands on a
 *  host element outside a template binding. */
export function applyLayoutClasses(el: HTMLElement, classes: LayoutClasses): void {
  if (classes.class) el.className += (el.className ? ' ' : '') + classes.class;
  if (!classes.style) return;
  for (const [property, value] of Object.entries(classes.style)) {
    el.style.setProperty(cssPropertyName(property), value);
  }
}
