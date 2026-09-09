# Changelog

All notable changes to `ngx-formad` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/); this project is pre-1.0, so minor
versions may carry breaking changes.

## 0.9.0

### Added

- **Recurrent steppers - `createRecurrentStepper` / `RecurrentStepperBuilder`.** The
  0.8.0 note admitted that a loop ("add another device, then the same three steps
  again") "ended up as a second stepper nested inside a step". It no longer does: a
  recurrent stepper is a flow abstraction equal in rank to the linear one - a ring
  of *pass steps* around a *dock*. Finishing a pass folds its values into the flow's
  own state through the author's pure `fold` and lands on the dock; the dock can only
  reopen the ring or complete the flow. State is the flow's own: `initial` declares
  the accumulator, it lives inside the ring as `ctx.flow.state()` (a dynamic dock step
  hands it to its components), and nothing outside mutates it. Entry is conditional -
  a state for which `dockReachable` holds lands on the dock, any other opens a pass on
  its first step (without `dockReachable`, the dock is reachable once a pass has
  folded) - and validity derives from the state (`completeWhen`), never from the path
  taken. A ring built at the root (`new RecurrentStepperBuilder({ initial })`) goes
  straight into `<ngx-formad-stepper>`; its `completed` carries the state.
- **Nesting, both ways - `createStepper` on either builder.** A linear flow can hold
  a recurrent one as ONE step of its sequence and vice versa, driven by a child
  controller per flow slot behind the same root chrome: exactly one
  `<ngx-formad-stepper>` and one chrome in the DOM, whatever the depth. The facade
  delegates leaf-describing members (`step`, `heading`, `canNext`, `blockers`, ...)
  down the active chain and keeps wizard-scoped ones (`index`, `total`, `labels`,
  `committed`, `goTo`, `reset`) at the root, so an existing chrome renders nested
  flows unchanged and the rail never jumps: a nested flow is one slot.
- **The dock contract - `FlowDock` + `ngxFormadDockRestart` / `ngxFormadDockNext`.**
  A dock component stays dumb: it either injects the two-method `FlowDock` or marks
  its buttons with the attribute directives, MatDialog-style. No controller, no
  `goTo`, no shared-state reach-ins from a layout leaf.
- **The incremental, reactive step context - `ctx.steps`, `ctx.shared`, `ctx.parent`.**
  The pool holds TEMPLATES; the step that places a form instantiates it, so the same
  config on two steps is two independent instances. What a later step reads is
  therefore keyed by STEP: a step named in its options (`{ name: 'basics' }`) exposes
  its live instances to every successor as `ctx.steps.basics.<poolName>` — a
  `FormState` (`.model()`, `.rootForm`) or a control's `{ field, value() }` — typed by
  accumulation along the chain, `| undefined` when the step is gated (`when`, a
  branch arm, a pass). Unnamed steps are reachable by authored index only, which
  is fragile under reordering: name any step another one reads. `ctx.shared` is the
  store as one signal per key (the GLOBAL channel, `bind`'s counterpart), and a
  nested flow keeps its own namespace of step names, reaching the level above through
  `ctx.parent`. Everything in the context is live: `when`, `completeWhen`, a branch
  selector, a fold and a dynamic step all read the same reactive tree — no snapshots.
- **Local seeding - `addForm(name, { initial: (ctx) => Partial<M> })`.** The LOCAL
  channel from a predecessor's live instance into this form, applied once, when the
  step comes to life; an `undefined` entry leaves the field's own default alone.
  `bind` stays the global one.
- **Revisit policies - `StepRevisit` and `FormRevisit`.** What a step the user comes
  back to does is the author's call, per placement, and the default is to keep it:
  the pages, the forms and what was typed stay as they were, so an address page does
  not reset because the cart was confirmed. `addForm(name, { revisit:
  FormRevisit.Reseed })` reads `initial` again from the current context on every
  entry and writes it into the fields the user has not edited; `createStep(build, {
  revisit: StepRevisit.Fresh })` drops the step on entry and builds it again, pages
  and forms alike. Shared links are reapplied to pristine fields on every entry either
  way: `LiveForm.seed(ctx)` on the first entry, `reseed(ctx)` on the next ones.
- **`CommittedOf<typeof built>`.** `Stepper` now carries the accumulated step record
  (`TSteps`), so a host can narrow the erased `stepCommitted` record ONCE, at the
  boundary, to `{ [step]?: { [poolName]: model } }` instead of casting per field.
- **Dynamic steps - the step callback's second parameter.** Declaring it —
  `createStep((step, ctx) => ...)` — makes the step's STRUCTURE follow the live
  context: the callback runs when the step is reached (a pure factory over the
  entry context), so which pooled forms it places and what prose it shows can
  depend on the user's earlier answers. One place for the context, no new
  callbacks anywhere: a one-parameter callback stays plain data built once,
  exactly as before. In-form conditionality stays `hidden()`/`visibleWhen` — the
  dynamic step covers only what those cannot: the page's structure.
- **Refusals that name the fix.** Three mistakes that used to fail far from their cause
  are refused where they are made, with a `Rejected<...>` naming the fix: bindings for a
  field whose kind is unknown, not exact (a wide `ui`, an annotation `: FormConfig<M>`)
  or has no component in `ControlComponents`; a `customField()` without a `control()`
  placement, in `defineForm`, `instantiateForm` and `createForm`; and
  `createPage(options, build)` with the arguments the other way round.
- **Flow providers - `provide(...)` on both builders.** A wizard is its own
  injection environment: the providers declared at the flow's definition become an
  `EnvironmentInjector` (a nested flow's inherits its parent's, the root inherits
  the application's), torn down with the wizard. Step components resolve them
  directly — a page component stays clean, injecting what the flow declared
  instead of taking wired inputs — and author callbacks (`when`, `completeWhen`,
  dynamic steps, `fold`, branch selectors, result resolvers) run inside the flow
  context, so `inject(...)` works in them the way it does in a router guard.
  Providing a class token creates a NEW flow-scoped instance; hand an existing
  one over with `{ provide: Token, useValue: instance }`. `StepperController`
  gains `destroy()`, called by the shell on `ngOnDestroy`.
- **The progress model - `controller.progress()`.** A machine-readable
  `StepperProgress`: one level per controller along the active chain, a linear level
  as a rail, a recurrent one as a pass bar with the dock as a distinct, separately
  reachable point plus the collected count. The bundled chrome renders the deeper
  levels behind an `aria-expanded` disclosure, announces the collected count through
  a polite live region, and keeps the root rail untouched.

- **`formLayout().control(key, { component, placement? })`.** A field rendered by a
  specific `FormValueControl` component instead of a registered kind: the renderer
  creates the component with `FormField` bound to the field. The argument is a
  `FieldComponentConfig<M[K], C>`, so the component must edit the field's own value
  type, and the layout's type remembers `C` under the field (`FormLayout<M, P>`,
  `FormConfig<M, U, P>`, kept by `defineForm`). The field is declared `customField()`
  in `ui` (formodel 0.3); one left without a `control()` placement throws when the form
  is instantiated. A `content()` gate inside a form reads the layout context
  (`{ model, shared }`), never the field tree.
- **Bindings - one place per form instance.** Everything a field's component is bound
  with beyond `FormField` (inputs, outputs, two-way) is declared in the second argument
  of `instantiateForm(config, bindings, effects?)` and of `addForm(name, bindings, cfg?)`:
  a record keyed by field name, under it `inputs` and `outputs` keyed by the component's
  own names, typed by the component the layout placed or by the one `ControlComponents`
  (a new, augmentable interface: kind → component class) registers for the field's kind.
  An input takes a `Live<T>`, an output a handler `(payload, ctx)`. `ctx` is the form's
  writable `model`; inside a stepper the step context with `model` layered in
  (`StepFormContext`). A group nests its record, a repeating group binds every item.
- **Effects - Angular `effect()`s over a live form.** `instantiateForm(config, bindings,
  effects)` and `addForm(name, bindings, { effects })` take `(ctx) => void` side effects,
  each run as an `effect()` created with the instance and ended with it: `FormState`
  and `LiveForm` gain `destroy()`, called when a step is dropped (`StepRevisit.Fresh`, a
  restarted pass).
- **Rendering by mount - `MountPoint`.** A form's view is decided when the form is
  instantiated, not when a template runs: `FormState.view` is a `FormLevel` whose rows
  are a `computed` over the level, and each `ControlRow` carries an injector holding
  a `ComponentMount` - the formField component, the `FormField` and `LayoutItem`
  directives with their bindings, and the flow's environment. The template draws a
  `MountPoint` per row through `NgComponentOutlet`, and its constructor creates the
  component where the row stands with `createComponent`. No directive re-registers a
  field, no `effect` runs per formField, no lifecycle hook is involved; a field hidden
  by the schema has no row and so no formField. Array items are a `linkedSignal`
  keyed by the item's `FieldTree` identity, so an item keeps its instance across a
  programmatic write to the array. Page components go the same way:
  `LiveStep.components` maps each `ComponentNode` to the injector its mount point
  creates it from.
- **`Live<T>` and `read()`.** `Live<T> = T | (() => T)` is the one way a config value
  may follow a signal, and `read(value)` the one function that reads either.
  `FormConfig` widens the authored ui with `LiveUiConfig<M>`, so any presentational
  prop (`label`, `placeholder`, `options`, a date's `limit`, a custom node's `props`)
  may be a signal; page headings, step labels, component inputs and content text take
  the same type. formodel stays plain: 0.3.0 carries no reactive type at all.
- **`GridPlacement.colStart`** and `formLayout().row(build, { cols, gap, colSpan,
  colStart })` - a row's own grid plus its placement in the parent grid. `LayoutItem`
  (`[ngxFormadItem]`) puts a placement's class and style on the element it sits on;
  the renderer attaches it to every placed formField.

### Removed

- **`formLayout().component()` and `FormComponentContext`.** A form's layout arranges
  fields (`field`, `control`, `row`) and prose (`content`); a component that edits a
  field is a `control()`, a widget that is not a field belongs to the page. The field
  tree is no longer handed to anything a layout places.
- **Standalone value controls** — `createControl`, `addControl`, `ControlEntry`,
  `LiveControl`, `ControlOutlet`, `stepValueNames`, `StandardSchemaOf` and the
  `controls` pool on flows. A page composes forms and widgets; a value that gates a
  step belongs to a form field, placed with `formLayout().control(...)` when it needs
  its own editor.
- **The selector callbacks and their recorders.** `addForm((f) => f.lead, …)` is
  `addForm('lead', …)`; `bind: (l) => l.link((m) => m.company, (s) => s.company)` is
  `bind: { company: 'company' }` (a nested group binds through a nested record);
  `effects: (e) => e.on((m) => m.taxId, 'resolved', handler)` is `effects: { taxId:
  [{ output: 'resolved', handler }] }`. `FieldRef`, `FieldRefs`, `SharedLink`,
  `selectedKey` and `OutputHandler` go with them; the records are checked against the
  model and the shared keys exactly as the callbacks were.
- **`asRenderable`, `asStepper` and `StepperResult`.** A `FormState<M, U>` is what
  `<ngx-formad-form [state]>` takes and a built `Stepper` or `RecurrentStepper` is
  what `<ngx-formad-stepper [stepper]>` takes; the erasure is assignability, not a
  call. A result type is read off the built stepper's own generic.
- **`FormRenderer`'s `[layout]` and `[effects]` inputs.** The grid is part of the state
  (`FormState.grid`, the view's container classes) and a field's bindings are wired when
  the form is instantiated (`instantiateForm(config, bindings)`).
- **`addForm({ effects })` as output handlers, `control({ bindings })`, and
  `addComponent({ inputs, outputs })`.** What a field is bound with lives in ONE place
  per abstraction - the bindings argument of `instantiateForm` / `addForm` - so the
  layout's `control()` no longer takes `bindings` and the old `effects` record
  (`{ field: [{ output, handler }] }`) is the field's own output key inside that
  argument. `OutputEffectCfg`, `FormEffects`, `EffectRecord`, `OutputEffect`,
  `recordEffects`, `toBindings`, `ComponentInputs` and `ComponentOutputs` go with it; a
  page component takes Angular's own `Binding[]` (`addComponent(Cmp, { bindings })`), so
  `ComponentCfg` no longer carries the component's type parameter.
  `effects` now means an Angular `effect()` over the form.
- **The outlets and the sync helpers** — `FieldOutlet`, `ComponentOutlet`,
  `BoundOutputEffect`, `samePath`, `SyncField`, `SharedSlot`, `seedFromShared`,
  `commitToShared`, `fieldSync` and `SharedState.slot()`. The mount replaces the
  outlets; a `LiveForm` seeds and commits its own links through the field tree, and
  `SharedState.select(key)` / `signals()` are the per-key signals.
- **`ReactiveValue`, `readReactive`, `mapReactive`, `reactive`, `ReactiveControlNode`,
  `ReactiveUiConfig`.** One type, `Live<T>`, one function, `read()`, and the
  `LiveControlNode` / `LiveUiConfig` widenings.
- **`stepFormNames`.** `formNodes(pages)` lists the form nodes the pages place.

### Changed

- **`committed()` / `stepCommitted` are keyed by step, then by pool name** —
  `{ basics: { basics: {...} } }`, a nested linear flow as its own step record, a
  recurrent flow as its folded state — because a template placed twice is two values.
  A form hidden by `visibleWhen` is on its step but not among its values.
- **`ctx.value(name)` is gone; `ctx.shared.<key>` is a signal.** Read a predecessor
  through `ctx.steps.<step>.<poolName>.model()`, the store through `ctx.shared.key()`.
  `StepContextFor`, `Committed` and the `FlowEntry` pool entry are removed with it: a
  nested flow is a STEP of its parent (`ctx.steps.<flowName>`), not a pool member,
  and step names are a namespace of their own (`claimName`) beside the pool's. Both
  namespaces span a fork: an arm's step or form name may not repeat the parent's or
  another arm's, so a form two arms place is declared once, before the fork.
- **The controller is one immutable value.** `FormadStepperController` keeps its
  position - the cursor, the blocked-Next flag, the live steps by node and which of
  them are shown - as one `Navigation` value in a single signal; every move is
  `nav.set(nav().transition())`, and the current step, the rail, the gate and the
  blockers are computeds over it, none of which writes anything. The self-gating
  repair `effect` and the bootstrap `afterNextRender` are gone: an eager step is
  materialized inside the action that enters it, a step with lazy forms resolves its
  loaders and lands only if the cursor still points at it. A nested flow's committed
  value is PULLED live from its child controller, so `committed()` always carries
  the state under the flow's name.
- **`createPage(build, options?)`.** The build callback first, the options
  (`heading`, `subheading`, `layout`) second, as `createStep`, `addContent` and
  `formLayout().row` take theirs.
- **`materializeStep(pages, options)` and `resolveStepForms(pages, pool)`** take the
  step's pages and, for the former, a `MaterializeOptions` object (`pool`, `shared`,
  `environment`, `injector?`, `entry`). `LiveStep` gains `components` and
  `instances`; `LiveForm` gains `visible`, `issues`, `reseed(ctx)` and `touch()`.
- **`FormState` gains `grid` and `view`**, and `instantiateForm` creates the mount of
  every formField along with the field tree, so it runs in an injection context
  whether or not a template is ever drawn from it.
- **`StepNode` carries `kind: SequenceNodeKind.Step`** and `Stepper.steps` is
  `readonly SequenceNode[]` (`StepNode | FlowStepNode`). Hosts that walk the steps
  themselves must narrow with `isStepNode` / `isFlowStep` - `materializeStep` accepts
  only leaves, at compile time.
- **`withState` intersects** (`TShared & S`) instead of replacing, so a nested
  flow's own state layers over the parent shape it already reads.

## 0.8.0

### Added

- **Jumping between steps - `controller.goTo(target, { fresh })`.** The sequence was
  strictly linear: `next` and `back` moved one step, so a flow with a loop ("add
  another device", and then the same three steps again) or a summary whose "Edit"
  link points at the step that owns a value had nowhere to express itself, and ended
  up as a second stepper nested inside a step. `goTo` takes a position or a step
  `label`, commits the step it leaves the way every other move does, and does nothing
  when no step answers to the target. `fresh` discards the destination's cached
  instances and those of every step authored after it, so the sub-flow is built again
  from its form factories and seeded from current shared state - without it a revisit
  keeps whatever the user typed the first time, since seeding only touches fields
  they never edited.

## 0.7.0

### Added

- **Content blocks - `addContent(options?, build)`.** A page's content slot was a bare
  `<div>`, so every sentence, note or hint around a form needed a component written for
  one paragraph. Now the slot takes a builder whose methods *are* the tags
  (`p`, `span`, `a`, `ul`/`li`, `h1`–`h6`, `img`, `button`, …), and what it emits is the
  same node data as everything else here: text and attributes may be getters (a change
  updates one text node - the tree is never rebuilt) and `visibleWhen` gates a tag or
  the whole block. A tag takes its text, its options and its children - `p('Signed, ',
  { className }, (p) => p.strong('COMPANY'))` - sorted out by shape, so a container is
  `div({ className }, (d) => …)` or plain `ul((list) => …)`. `insert(build, at?)` writes
  *inside* the tag added just before and leaves the cursor there, and `continue(text,
  at?)` keeps writing in it: a sentence with a link in the middle stays one flat chain,
  and can hold several. The tag vocabulary is
  closed (`CONTENT_TAGS`) and nothing is interpolated as markup: the renderer also
  refuses attribute names beginning with `on` and scheme-checks URL attributes, so a
  tree that arrived as JSON cannot name `<script>`, hang an inline handler off a `div`,
  or point an `href` at `javascript:`. (It is not a full sanitizer - `style` is allowed,
  as in Angular's own bindings.) Values stay as authored: a constant is written once and
  only a getter is subscribed to, so a static block is plain data and costs no effects.
  Called without a build callback, `addContent` is the bare layout slot it always was.
- **The same builder inside a form - `formLayout(...).content(build, cfg?)`.** A group
  heading or a hint *between fields* is data too, gated on the live form context
  (`visibleWhen: (ctx) => …`) and placed in the grid like any other item.
- **Step labels - `createStep(…, { label })` + `controller.label` / `controller.labels`.**
  A chrome's progress rail had to keep its own list of step names and re-evaluate every
  `when` to know which steps were visible - two independent answers to "who is in the
  sequence", silently misaligned against `index`/`total` when they drifted (and blind to
  steps added inside a `branch` or a fork arm). The label now rides on the step, and the
  controller derives `labels` from the same effective sequence as `index`/`total`, so
  position N of the rail is always step N of the flow.
- **The bundled chrome draws the heading, the subheading and a rail.** `PageOptions`
  carried `heading`/`subheading` that no chrome ever rendered; the default look now
  shows them (`.ngx-formad-heading`, `.ngx-formad-subheading`) above the step body, with
  the labels as an `<ol class="ngx-formad-rail">` marking the current step
  (`aria-current="step"`). A flow that labels no step gets no rail. **If you were
  drawing a page's heading yourself around `<ngx-formad-stepper>` with the bundled
  chrome, you will now see it twice** - drop yours, or provide a chrome of your own.

### Changed

- **`PageOptions.heading` / `subheading` are `Reactive<string>`.** A step's own title is
  often a function of what the user picked ("Pick products (2)"), which re-authoring the
  tree for would be absurd. Passing a string still compiles; code that *reads* the
  option (rather than the controller's resolved signal) must resolve a getter now -
  `typeof heading === 'function' ? heading() : heading`.
- **`ContentNode.children` is required.** Anything constructing page nodes by hand
  instead of through `PageBuilder` needs `children: []` for a bare slot - though the
  renderers tolerate its absence, so a 0.6-era node still draws its slot.
- **Content renders during change detection** (an effect, not `afterNextRender`), so it
  follows a changed `children` input and appears in server-rendered output. Hydration of
  a content block is untested; treat SSR + hydration as unverified.

### Fixed

A review of the runtime turned up a set of long-standing bugs; they are fixed here
because 0.7.0 is the first release since they were found.

- **A step that gates itself off no longer ends the wizard.** `advance()` read "not
  in the effective sequence" as "was the last step", so a checkbox that dropped its
  own step (a "skip the rest" flag the step itself writes) fired `completed` and
  swallowed every step after it. Navigation now falls back to the authored order -
  the nearest visible step after it, or before it for Back, which was a silent no-op
  in the same situation.
- **A hidden form no longer commits its defaults.** `commitCurrent()` committed every
  form and control on the step, visible or not, so on a step with two mutually
  exclusive forms bound to the same shared key the hidden one's blank model
  overwrote the answer the user typed, and `committed` gained a phantom model a
  later step's `value(...)` read as real. Visibility was already honoured by the
  completion fold, the blocker list and the renderer; now it is honoured here too.
- **The wizard's reactive graph is scoped to the component.** `<ngx-formad-stepper>`
  built its controller with the *environment* injector, so every step's field tree
  and every `afterNextRender` it scheduled outlived the component: routing in and out
  of a wizard grew the graph each time. It now uses the component's own injector.
- **A blocked Next explains itself while validators are running.** An async validator
  in flight makes `valid()` false with no errors to report, so `blockers` came back
  empty and the chrome drew nothing. The controller gained `validating`, and the
  blocker list says so when nothing else is wrong.
- **Grid placement works under the zero-dependency layout adapter.** `colSpan` on a
  field was applied with `el.style.setProperty('gridColumn', …)`, which CSSOM ignores
  (it takes hyphenated names only), and the slots for components, content blocks and
  rows read only the adapter's `class` half while `cssLayout` answers with `style`.
  Both halves are applied now, and a group or array honours its own placement instead
  of always spanning the row.
- **`StepFormsView` honours `visibleWhen` and forwards `effects`.** The forms-only
  building block a custom chrome drops in had drifted from the page renderer: it drew
  forms their own gate had hidden (which the completion fold excludes) and dropped
  every `addForm({ effects })` wiring.
- **The plain-HTML select shows what the model holds.** Its `<option>`s carried no
  value and there was no empty option, so a value matching none of them (the usual
  empty initial one) displayed as the first option while the model held something
  else - a required field blocking Next next to a visibly made choice.
- **A form's `[layout]` input is no longer shadowed by an empty overlay grid.**
  `formLayout().build()` always emits a `grid` object, and `state().grid ?? layout()`
  let that empty object win.
- **`withState` no longer mutates the caller's object.** The root builder stored the
  literal by reference and `fork` merged each arm's state into it, so a shared
  constant picked up keys from whichever wizard was built last.
- **Dynamic components, standalone controls and fields follow their node.** All three
  outlets read their input once at mount, while the renderers reuse views by key - so
  a host swapping one form (or page) for another kept the previous config's bindings,
  labels and even control kind. They re-mount when the node changes.
- **Custom control kinds are looked up as own properties.** `controlFor('constructor')`
  resolved to something off `Object.prototype` instead of falling back.
- **A new repeating-array item starts from the right empty value.** `date`, `select`,
  `radio` and `file` keys were seeded with `''` instead of `null`.
- **Lazily declared forms on one step load concurrently** instead of one after
  another, so a step costs its slowest import, not their sum.
- **Shared state survives a value `structuredClone` cannot copy.** A function or a
  signal in `withState` threw `DataCloneError` from the store's constructor; it now
  falls back to a shallow copy.

## 0.6.0

### Added

- **Standalone value controls — `createControl` + `addControl`.** A bare
  `FormValueControl` component (a plan picker, a consent card) can now be pooled beside
  the forms and placed on a page directly, without authoring a one-field form around it.
  The runtime wraps it in an implicit single-value field tree bound through the native
  `FormField` directive, so it is a full citizen of every existing pipeline: its
  validity folds into `canNext`, its value commits on leave under its pool name (typed
  in `ctx.value(...)` — the type is read off the component's `value` model), and
  `bind: 'key'` syncs it with shared state through the directional engine. An optional
  `schema` accepts any Standard Schema (zod 4, valibot, arktype), validated natively by
  signal forms' `validateStandardSchema` — the suite vendors only the spec's types, so
  no dependency is added.
- **A blocked Next explains itself.** Calling `next()` while the completion gate is
  closed no longer refuses silently: it marks every field and control touched (so each
  shows its own errors in place) and raises the new `nextBlocked` signal, with
  `blockers` listing every visible invalid field's labeled errors — plus the step's new
  `incompleteMessage` when a `completeWhen` guard is what holds. The list is
  self-retracting: fixing the last problem clears it without another click. The bundled
  chrome renders it and keeps Next clickable (`aria-disabled` + an `ngx-formad-blocked`
  class instead of `disabled`) — a dead button was exactly the stuck-user trap this
  removes.

### Changed

- **`completeWhen` now receives the step context.** The guard gets the same typed
  `{ shared, value(...) }` as `when`, so a component-driven step can gate Next on shared
  state or a previous step's committed value. Zero-argument guards keep compiling — the
  argument is simply ignored.
- **`committed` / `stepCommitted` / `FormadWizard.committed` widened to
  `Record<string, unknown>`.** A standalone control commits its raw value (not a model
  record), so the egress map's value type is now honest about holding both.
- **`addForm` selects forms only.** Its selector is typed against the pool's form
  entries (`FormKeys`), so selecting a pooled control is a compile error — and vice
  versa for `addControl`.

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
