import { Breakpoint, ItemSpec, LayoutAdapter, LayoutSpec, responsiveEntries } from './layout-adapter';

function prefix(bp: Breakpoint): string {
  return bp === 'base' ? '' : `${bp}-`;
}

/** The class-based layout adapter; pair it with the shipped `ngx-formad/styles` grid. */
export const classLayout: LayoutAdapter = {
  container(spec: LayoutSpec) {
    const cols = responsiveEntries(spec.cols).map(([bp, value]) => `ngx-formad-cols-${prefix(bp)}${value}`);
    const gap = spec.gap != null ? [`ngx-formad-gap-${spec.gap}`] : [];

    return { class: ['ngx-formad-grid', ...cols, ...gap].join(' ') };
  },

  item(spec: ItemSpec) {
    const spans = responsiveEntries(spec.colSpan).map(([bp, span]) => `ngx-formad-col-${prefix(bp)}${span}`);
    const starts = responsiveEntries(spec.colStart).map(
      ([bp, start]) => `ngx-formad-col-start-${prefix(bp)}${start}`,
    );
    const classes = [...spans, ...starts];

    return classes.length ? { class: classes.join(' ') } : {};
  },
};
