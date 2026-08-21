# Changelog

All notable changes to `ngx-formad` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/); this project is pre-1.0, so minor
versions may carry breaking changes.

## 0.5.0

### Changed

- **A step no longer flashes a placeholder when it has nothing to wait for.** `enter`
  used to defer every first-time build to `afterNextRender`, so each step showed the
  loading state for a frame - across a long wizard that reads as if every step were being
  generated on the spot. A step whose forms are all eager materializes synchronously, so
  it is now built in place and appears with the click. A step with a lazy form still
  shows the placeholder and builds in the following frame, which is the case the deferral
  existed for.

### Fixed

- **`StepPageView` reused views across steps.** Its `@for` loops tracked by `$index`, so
  moving between steps of the same shape reused the previous step's nodes instead of
  replacing them; the placeholder frame had been masking it. Both loops now track the node
  and page objects. Without this, mounting a step in place rendered the *previous* step's
  forms.

## 0.4.0

### Added

- **Reactive config props.** Every *presentational* prop of a control node —
  select/radio `options`, `label`, `placeholder`, textarea `rows`, a date's `limit`,
  file props, a custom control's `props` bag — may now be authored as a `Signal`
  instead of a value; the renderer reads it live through the field's input bindings.
  Seed a select after the form is instantiated by setting the signal. Structural
  config (`type`, group/array shape) stays static by design.
- **Typed `ui` on `FormState`.** `FormConfig`/`FormState`/`instantiateForm` gained a
  second type parameter `U` carrying the *authored* ui type through, so a prop you
  declared as a `WritableSignal` comes back writable:
  `state.ui.country.options.set(...)`. Declare configs with the new `defineForm(...)`
  helper (or `satisfies FormConfig<M>`) to keep the inference; a plain
  `FormConfig<M>` annotation still works and falls back to the widened default.
- New exports: `ReactiveValue<T>`, `ReactiveControlNode`, `ReactiveUiConfig<M>`,
  `readReactive`, `mapReactive`, `reactive` (threads a signal through formodel's
  plain-typed builder helpers), and `defineForm`.

### Changed

- `FormConfig.ui` is typed `ReactiveUiConfig<M>` (a widening of formodel's
  `UiFormGroupConfig<M>` — every existing config, including everything
  `UiFormConfigBuilder` produces, is assignable unchanged).
- `FieldConfig.node` is typed `ReactiveControlNode` (was `UiFormControlNode`).
  Consumers folding over `FormState.fields` and reading presentational props
  directly (e.g. `node.label` for an error summary) should read them through
  `readReactive(...)`, which passes plain values through and unwraps signals.
- `extraInputsFor` may now return signal values (a `computed` for derived props such
  as mapped select options); the renderer binds every entry through `readReactive`.

### Notes

- Zero runtime cost for static configs: the widening is type-level, and a
  signal/`computed` is created only for props actually authored as signals.

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
