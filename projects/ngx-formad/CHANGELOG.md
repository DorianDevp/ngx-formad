# Changelog

All notable changes to `ngx-formad` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/); this project is pre-1.0, so minor
versions may carry breaking changes.

## 0.3.0

### Added

- **Form layout overlay.** `FormConfig.layout` arranges a form's fields in a
  responsive grid and drops components between them, without touching field-building
  in `ui`. Author it with the new `formLayout(...)` builder — `.cols()`/`.gap()` for
  the container, `.field(key, { colSpan, colStart })` for placement, `.component(cmp,
  cfg)` to insert a component, and `.row(grid, build)` for a nested sub-grid.
- **Components inside a form.** A layout component's inputs/outputs and `visibleWhen`
  are functions of a live `FormComponentContext` — `{ model, form, shared }` — so a
  component binds reactively to field values, per-field state (`form.x().errors()`),
  and, inside a stepper page, the cross-step `shared` store (`null` standalone).
- **Responsive layout specs.** `LayoutSpec.cols` and `ItemSpec.colSpan`/`colStart`
  now accept a per-breakpoint map (`{ base, sm, md, lg, xl, … }`) as well as a
  constant. Breakpoint names are open — define your own.
- **`classLayout` adapter + shipped stylesheet.** A class-based layout adapter that
  emits only class names (no inline styles). Generate the backing CSS for *your*
  breakpoints from `ngx-formad/styles`:
  `@use 'ngx-formad/styles' as formad; @include formad.grid((md: 48rem, …));`.
  Emitted mobile-first, so a value set at one breakpoint waterfalls upward.
- `FormComponentSpec`, `FormComponentNode`, `FormRowNode`, `FormLayout`,
  `FormLayoutItem`, `FormComponentContext`, `buildLayoutNodes`, `Responsive`,
  `Breakpoint`, and `responsiveEntries` are now exported.
- `FormadWizard.sharedOrNull()` — read the shared store without throwing before the
  stepper shell initializes it.

### Changed

- **`cssLayout.item` output.** Column spans now emit `grid-column: span N / span N`
  (was `span N`) and honour `colStart`. Responsive specs resolve their `base` value
  under `cssLayout` (inline styles cannot carry media queries — use `classLayout` for
  breakpoints).
- `FormState` gained an optional `grid`, carried from a layout overlay; `FormRenderer`
  applies it over its `layout` input.

### Notes

- Fully backward compatible for forms without a `layout` overlay: `buildNodes` and the
  declared-field render path are unchanged.
