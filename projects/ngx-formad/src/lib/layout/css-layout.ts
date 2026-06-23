import { ItemSpec, LayoutAdapter, LayoutSpec } from './layout-adapter';

// The zero-dependency default. It emits inline CSS grid styles so a fresh
// install renders a sane two-axis layout with no Tailwind, no stylesheet, and
// no build step. It is deliberately plain — the entry point of the funnel, not
// the pretty end of it.
export const cssLayout: LayoutAdapter = {
  container(spec: LayoutSpec) {
    const cols = spec.cols ?? 1;
    // gap is on Tailwind's scale (1 = 0.25rem) so specs read the same whether
    // they end up here or in the Tailwind adapter.
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
    if (spec.colSpan == null) return {};
    return { style: { gridColumn: `span ${spec.colSpan}` } };
  },
};
