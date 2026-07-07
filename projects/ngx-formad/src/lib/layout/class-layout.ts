import { Breakpoint, ItemSpec, LayoutAdapter, LayoutSpec, responsiveEntries } from './layout-adapter';

// The class-based adapter: it emits only class names — the responsive grid CSS
// lives in the shipped `ngx-formad/styles` (generate it with YOUR breakpoints via
// the `grid(...)` mixin), so nothing is inlined. Pair the two: register this
// adapter and include the stylesheet, and every layout spec resolves to classes
// like `ngx-formad-grid ngx-formad-cols-md-2` / `ngx-formad-col-md-6`.

// `base` carries no breakpoint prefix; every other name becomes `<name>-`.
function prefix(bp: Breakpoint): string {
  return bp === 'base' ? '' : `${bp}-`;
}

export const classLayout: LayoutAdapter = {
  container(spec: LayoutSpec) {
    const classes = ['ngx-formad-grid'];
    for (const [bp, cols] of responsiveEntries(spec.cols)) {
      classes.push(`ngx-formad-cols-${prefix(bp)}${cols}`);
    }
    if (spec.gap != null) classes.push(`ngx-formad-gap-${spec.gap}`);
    return { class: classes.join(' ') };
  },

  item(spec: ItemSpec) {
    const classes: string[] = [];
    for (const [bp, span] of responsiveEntries(spec.colSpan)) {
      classes.push(`ngx-formad-col-${prefix(bp)}${span}`);
    }
    for (const [bp, start] of responsiveEntries(spec.colStart)) {
      classes.push(`ngx-formad-col-start-${prefix(bp)}${start}`);
    }
    return classes.length ? { class: classes.join(' ') } : {};
  },
};
