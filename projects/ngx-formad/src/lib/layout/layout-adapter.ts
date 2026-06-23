// The layout axis is orthogonal to controls: it only decides how a cluster of
// fields is arranged, never how a single field renders. An adapter turns a
// declarative spec into the two things a template can apply — a class string or
// an inline style map — so the renderer stays ignorant of Tailwind vs raw CSS.

/** How a container arranges its children. */
export interface LayoutSpec {
  /** Number of grid columns. Defaults to 1 when omitted. */
  readonly cols?: number;
  /** Gap between cells, in 0.25rem steps (Tailwind's spacing scale). */
  readonly gap?: number;
}

/** How a single child sits inside its container. */
export interface ItemSpec {
  /** Columns this item spans. Omitted means a single column. */
  readonly colSpan?: number;
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
