import { ItemSpec, LayoutAdapter, LayoutSpec, Responsive } from './layout-adapter';

function baseOf<T>(value: Responsive<T> | null | undefined): T | undefined {
  if (value == null) return undefined;

  return typeof value === 'object' ? (value as Partial<Record<'base', T>>).base : value;
}

/** The zero-dependency layout adapter: inline CSS grid styles resolving the `base` value of each spec. */
export const cssLayout: LayoutAdapter = {
  container(spec: LayoutSpec) {
    const cols = baseOf(spec.cols) ?? 1;
    const gap = (spec.gap ?? 4) * 0.25;

    return {
      style: {
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: `${gap}rem`,
      },
    };
  },

  item(spec: ItemSpec) {
    const span = baseOf(spec.colSpan);
    const start = baseOf(spec.colStart);
    const style: Record<string, string> = {
      ...(span != null ? { gridColumn: `span ${span} / span ${span}` } : {}),
      ...(start != null ? { gridColumnStart: `${start}` } : {}),
    };

    return Object.keys(style).length ? { style } : {};
  },
};
