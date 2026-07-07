import { ItemSpec, LayoutAdapter, LayoutSpec, Responsive } from './layout-adapter';

// Inline styles can't carry media queries, so this default resolves only the
// `base` value of a responsive spec — enough for a sane single-breakpoint layout
// with no stylesheet. For real responsive layouts use `classLayout` (class names
// backed by the shipped `ngx-formad/styles`).
function baseOf<T>(value: Responsive<T> | undefined): T | undefined {
  if (value == null) return undefined;
  return typeof value === 'object' ? (value as Partial<Record<'base', T>>).base : value;
}

// The zero-dependency default. It emits inline CSS grid styles so a fresh
// install renders a sane two-axis layout with no Tailwind, no stylesheet, and
// no build step. It is deliberately plain — the entry point of the funnel, not
// the pretty end of it.
export const cssLayout: LayoutAdapter = {
  container(spec: LayoutSpec) {
    const cols = baseOf(spec.cols) ?? 1;
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
    const span = baseOf(spec.colSpan);
    const start = baseOf(spec.colStart);
    const style: Record<string, string> = {};
    if (span != null) style['gridColumn'] = `span ${span} / span ${span}`;
    if (start != null) style['gridColumnStart'] = `${start}`;
    return Object.keys(style).length ? { style } : {};
  },
};
