/** A responsive breakpoint key; `base` is the no-media-query default, other names are the consumer's. */
export type Breakpoint = 'base' | 'sm' | 'md' | 'lg' | 'xl' | (string & {});

/** A value constant across breakpoints, or varying per breakpoint (`{ base: 1, md: 2 }`). */
export type Responsive<T> = T | Partial<Record<Breakpoint, T>>;

/** How a container arranges its children: columns and gap. */
export interface GridLayout {
  readonly cols?: Responsive<number>;

  readonly gap?: number;
}

/** How one child sits in its container: span and start column. */
export interface GridPlacement {
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
  container(layout: GridLayout): LayoutClasses;

  item(placement: GridPlacement): LayoutClasses;
}
