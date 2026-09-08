import { Breakpoint, GridPlacement, LayoutAdapter, GridLayout, responsiveEntries } from './layout-adapter';

function prefix(bp: Breakpoint): string {
  return bp === 'base' ? '' : `${bp}-`;
}

/** The class-based layout adapter; pair it with the shipped `ngx-formad/styles` grid. */
export const classLayout: LayoutAdapter = {
  container(layout: GridLayout) {
    const cols = responsiveEntries(layout.cols).map(([bp, value]) => `ngx-formad-cols-${prefix(bp)}${value}`);
    const gap = layout.gap != null ? [`ngx-formad-gap-${layout.gap}`] : [];

    return { class: ['ngx-formad-grid', ...cols, ...gap].join(' ') };
  },

  item(placement: GridPlacement) {
    const spans = responsiveEntries(placement.colSpan).map(([bp, span]) => `ngx-formad-col-${prefix(bp)}${span}`);
    const starts = responsiveEntries(placement.colStart).map(
      ([bp, start]) => `ngx-formad-col-start-${prefix(bp)}${start}`,
    );
    const classes = [...spans, ...starts];

    return classes.length ? { class: classes.join(' ') } : {};
  },
};
