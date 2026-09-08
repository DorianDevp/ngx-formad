import { GridPlacement, LayoutAdapter, GridLayout, Responsive } from './layout-adapter';

function baseOf(value: Responsive<number> | null | undefined): number | undefined {
  if (value == null) return undefined;

  return typeof value === 'number' ? value : value.base;
}

/** The zero-dependency layout adapter: inline CSS grid styles resolving the `base` value of each spec. */
export const cssLayout: LayoutAdapter = {
  container(layout: GridLayout) {
    const cols = baseOf(layout.cols) ?? 1;
    const gap = (layout.gap ?? 4) * 0.25;

    return {
      style: {
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: `${gap}rem`,
      },
    };
  },

  item(placement: GridPlacement) {
    const span = baseOf(placement.colSpan);
    const start = baseOf(placement.colStart);
    const style: Record<string, string> = {
      ...(span != null ? { gridColumn: `span ${span} / span ${span}` } : {}),
      ...(start != null ? { gridColumnStart: `${start}` } : {}),
    };

    return Object.keys(style).length ? { style } : {};
  },
};
