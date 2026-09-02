/** A responsive breakpoint key; `base` is the no-media-query default, other names are the consumer's. */
export type Breakpoint = 'base' | 'sm' | 'md' | 'lg' | 'xl' | (string & {});

/** A value constant across breakpoints, or varying per breakpoint (`{ base: 1, md: 2 }`). */
export type Responsive<T> = T | Partial<Record<Breakpoint, T>>;

/** Normalizes a `Responsive<T>` into `[breakpoint, value]` pairs, `base` first. */
export function responsiveEntries<T>(value: Responsive<T> | null | undefined): [string, T][] {
  if (value == null) return [];
  if (typeof value !== 'object') return [['base', value]];

  const entries = Object.entries(value as Partial<Record<string, T>>).filter(
    (entry): entry is [string, T] => entry[1] != null,
  );

  return entries.sort(([a], [b]) => (a === 'base' ? -1 : b === 'base' ? 1 : 0));
}

/** How a container arranges its children: columns and gap. */
export interface LayoutSpec {
  readonly cols?: Responsive<number>;

  readonly gap?: number;
}

/** How one child sits in its container: span and start column. */
export interface ItemSpec {
  readonly colSpan?: Responsive<number>;

  readonly colStart?: Responsive<number>;
}

/** What an adapter hands back for one element: a class, a style map, or both. */
export interface LayoutClasses {
  readonly class?: string;

  readonly style?: Record<string, string>;
}

/** Resolves layout specs into classes or styles; swapped once via `provideFormadSuite`. */
export interface LayoutAdapter {
  container(spec: LayoutSpec): LayoutClasses;

  item(spec: ItemSpec): LayoutClasses;
}

/** Converts a camel-case style property to its CSSOM name; custom properties pass through. */
export function cssPropertyName(property: string): string {
  return property.startsWith('--')
    ? property
    : property.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

/** Puts one resolved `LayoutClasses` on an element: classes appended, styles set inline. */
export function applyLayoutClasses(el: HTMLElement, classes: LayoutClasses): void {
  if (classes.class) el.className += (el.className ? ' ' : '') + classes.class;
  if (!classes.style) return;

  for (const [property, value] of Object.entries(classes.style)) {
    el.style.setProperty(cssPropertyName(property), value);
  }
}
