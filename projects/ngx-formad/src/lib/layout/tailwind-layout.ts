import { responsiveEntries } from './layout-adapter';
import { Breakpoint, GridLayout, GridPlacement, LayoutAdapter } from './types/layout';

function at(bp: Breakpoint, utility: string): string {
  return bp === 'base' ? utility : `${bp}:${utility}`;
}

/**
 * The Tailwind layout adapter: the grid is Tailwind's own utilities, so the library ships no stylesheet and no
 * generator - your build emits exactly the classes your configs name. Tailwind only sees literals in your source, so
 * tell it about the ones this adapter composes; in v4 that is one line of CSS beside your import:
 *
 * ```css
 * @import 'tailwindcss';
 * @source inline("{sm:,md:,lg:,xl:,}{grid-cols-,col-span-,col-start-}{1,2,3,4,5,6,7,8,9,10,11,12}");
 * @source inline("gap-{0,1,2,3,4,5,6,8,10,12}");
 * ```
 *
 * The breakpoint keys of a `Responsive` value are Tailwind's screens, so `{ base: 1, md: 2 }` is
 * `grid-cols-1 md:grid-cols-2` and waterfalls upward the way Tailwind does.
 */
export const tailwindLayout: LayoutAdapter = {
  container(layout: GridLayout) {
    const cols = responsiveEntries(layout.cols).map(([bp, value]) => at(bp, `grid-cols-${value}`));
    const gap = layout.gap != null ? [`gap-${layout.gap}`] : [];

    return { class: ['grid', ...cols, ...gap].join(' ') };
  },

  item(placement: GridPlacement) {
    const spans = responsiveEntries(placement.colSpan).map(([bp, span]) => at(bp, `col-span-${span}`));
    const starts = responsiveEntries(placement.colStart).map(([bp, start]) => at(bp, `col-start-${start}`));
    const classes = [...spans, ...starts];

    return classes.length ? { class: classes.join(' ') } : {};
  },
};
