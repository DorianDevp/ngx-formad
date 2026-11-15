# Changelog

All notable changes to `ngx-formad` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/); this project is pre-1.0, so minor
versions may carry breaking changes.

## 0.16.0

### Added

- **A fork maps its tips in `build()`.** The arms that end a flow are its tips, named
  across nested forks (a forking arm is not a tip; its own arms are). `build({ tipA, tipB,
  ... })` takes one mapper per tip and the stepper hands out what the reached tip maps to,
  under its name: `{ tipA?: A; tipB?: B } | null`. Each mapper reads the context the flow
  ended in - the walked steps as they were entered, a gated one either there or absent,
  never `undefined` - and the store. A missing tip, a key that is no tip and a tip name
  two arms end in are refused by the types and at runtime. `build()` without mappers is
  unchanged.
- **`stepper.result()`**: the built stepper's result as a signal, what `(completed)`
  emits; `null` until a `<ngx-formad-stepper>` draws it and the flow stands on its last
  step.
- `FlowDefinition` carries a fork's `tips` and `reachedTip`, and `resolveResult` gets the
  walked context as an optional third argument; existing resolvers are unaffected.

## 0.15.0

### Added

- **The built stepper is typed, all the way to each form instance.** `stepper.shared.plan`
  is the `withState` key as a read-only signal; `stepper.steps.address.forms.shipping` is
  that step's form - **the `FormState` instance itself** for a config, typed by its
  template, and a **`Signal<FormState | null>`** for a loader or any form of a step built
  on entry, holding the instance once its step brings it to life. Gated steps and arms are
  there too. `BuiltSteps` is the type; inside the step context such an instance is
  `BuiltOnEntry<FormState<M>>`, a mark for the type system alone.
- **`FormadWizard<S>` is typed by the built stepper** -
  `inject<FormadWizard<typeof built>>(FormadWizard)`: `committed()`, `steps`, `shared`
  (writable: inside the stepper the store is the stepper's to write) and `controller()`. A
  formField of a step form injects it as a page component does.
- **`(stepCommitted)` and `(completed)` on `<ngx-formad-stepper>` are typed** from
  `[stepper]`; nothing to narrow at the boundary.
- **`define()`** on a chain, a fork and a docked ring: the flow as data, built nowhere.
- **`FormState.reset()`**: the instance starts over - the model back to what its factory
  starts from, every field untouched and pristine.
- **Editing and removing a ring's entry from its dock.** `dock(build, opts, listeners)`:
  listeners by the name of an output of a component on the dock page. The output emits an
  entry of the state; the listener gets a `FoldEntry` - one member per path a pass can
  take (tracked by the builder as a type: a gated step doubles the paths, a `branch` adds
  one per arm), that path's step values on the entry itself (`'serial' in entry`
  narrows), `value`, `index`, `remove()` and `reopen(step, { maxBackwardStep })`: a pass
  along the entry's own path, on `step`, every step starting from what it committed,
  Back reaching no further than `maxBackwardStep` (by default `step`) and cancelling
  there; the fold's additions take the entry's place.
- **`StepperController.backCancels`**: Back would leave an open pass for the dock.

### Changed

- **BREAKING: `build()` builds.** It runs in an injection context and builds the flow's
  environment, its shared state and every eager form there and then; that context owns
  them. `<ngx-formad-stepper>` only draws them, so drawing the same stepper again shows
  what was typed. A module-level `const x = builder.build()` now throws NG0203: keep the
  builder at module level and `build()` it in a field initializer. The injector `build()`
  runs in needs `provideFormadSuite` (a spec that only walked a stepper's steps now
  provides it), and a model factory runs then, not on entry: a model that reads data
  loaded later returns a `linkedSignal` over it.
- **BREAKING: one instance for life.** A `StepRevisit.Fresh` step, `goTo(…, { fresh })`,
  `reset()` and a ring's next pass reset the same instance instead of building a new one;
  a form's `effects` run from `build()` on.
- **BREAKING: the shared store is one signal per key, no methods.** `SharedState<S>` is
  `{ [key]: WritableSignal }`, made by `createSharedState(seeds)` and put back by
  `resetSharedState(state, seeds)`; a host reads `SharedSignals<S>`.
- **BREAKING: a built stepper is `{ shared, steps, instance }`.** What it was built from -
  `stepSequenceNodes` (was `steps`), `forms`, `sharedSeeds` (was the live `shared` store),
  `controlTypes`, `providers`, `resolveResult` - is the `FlowDefinition` that `define()`
  hands out, and `stepper.instance.flow`.

### Removed

- `SharedState.get`/`select`/`signals()`/`snapshot`/`patch`/`seeds()`/`reset()`, and
  `FormadWizard.sharedOrNull()`: the store is read and written by key.
- `SHARED_STATE`: nothing read it.

## 0.14.0

### Fixed

- **A form over a `linkedSignal` model no longer reads it while its component is
  constructed.** `instantiateForm` in a field initializer over an `input.required` threw
  NG0950: building the view looked every field up in the field tree, and the lookup reads
  the model's value. The lookup is now a `computed` run when the row is first drawn, so
  nothing in `instantiateForm` reads the value; the rest - field tree, view, mounts,
  effects - is built at once, as before, whatever the model. A config error (a field the
  model lacks) now shows at that first draw.
- **What a step form's layout places is created in the flow's environment.** formFields and
  `formLayout().component()`s inside a step form resolved the stepper's parent
  environment, so they could not inject what `.provide(...)` declared, while a page
  component could. `InstantiateOptions.environment` carries the flow's.

### Removed

- `InstantiateOptions.shared`: nothing read it.

## 0.13.0

### Changed

- **A form's own model signal lives in its config - `{ model: () => linkedSignal(...), ui }`.**
  `model` is a `FormModelSource<M>`: a factory called for each instance, returning the
  start value (the form makes the signal, as before) or a `WritableSignal<M>` that is the
  instance's model; or a `WritableSignal<M>` given as it is, the model of every instance.
  `state.model` is that very signal, in `instantiateForm`, a pool and an `addForm` alike.
  A `linkedSignal` over an input puts the input into the form without an effect: a new
  input value is a programmatic write, so the fields stay pristine. From a factory, a
  `StepRevisit.Fresh` step or a ring's pass gets a new one. The signal must hold a value
  when the form is instantiated, since the field tree reads it then - not an
  `input.required`, which has none in the constructor.

### Removed

- `instantiateForm(model, config, …)`: put the signal in `config.model` instead.
- `FormCfg.model` on `addForm` and `InstantiateOptions.model`: the template's `model` factory
  returns the signal.

## 0.12.0

### Added

- **A model signal of your own - `instantiateForm(model, config, bindings?, effects?)`.**
  When the first argument is a `WritableSignal<M>`, the form is built over it and
  `state.model` is that signal; a plain config keeps the old path, a fresh
  `signal(config.model())`. A `linkedSignal` over an input puts the input into the form
  without an effect: a new input value is a programmatic write, so the fields stay
  pristine. The signal must hold a value when the form is instantiated, since the field
  tree reads it then - not an `input.required`, which has none in the constructor.
- **A model of your own in a stepper - `addForm(name, { model: (ctx) => signal })`.** A
  factory, called for every instance the placement brings (a fresh step, a ring's pass),
  in an injection context; `initial` and shared links write into what it returns.
  `InstantiateOptions.model` carries it to `instantiateRuntimeForm`.
- **A shared key held in a signal of your own - `withState({ key: signal })`.** A
  `WritableSignal` among the seeds becomes that key's cell as it is, typed by its value
  (`StateOf<S>`); `reset()` and a ring's new pass leave it alone. `SharedState` takes
  `StateSeeds<T>`, and `seeds()` is what a rebuilt store is made from, so a later
  `withState`, a branch merge and `build()` keep the signal instead of copying its value.

## 0.11.0

### Added

- **A component slot in a form - `formLayout().component(config)`.** A widget that is not
  a field - a running total, a hint card, a lookup button - takes a layout slot of its own
  between the fields. `ComponentConfig` names the component, its `placement` and its
  `bindings`: a callback over the **form context** returning Angular's own `Binding[]`,
  the way `addComponent` binds a page component. The callback runs once, at mount; a
  getter inside `inputBinding` is what keeps an input following the model, and an
  `outputBinding` may write back through `ctx.model`. Nothing ties the slot to a field:
  no `FormField`, no validity, no place in the schema - a widget that *edits* a value is
  still a `customField()` placed with `control()`. The render tree gains
  `FormComponentNode` (keyed `@component:<index>`, like content and rows), the view a
  `ComponentRow`.
- **`FlowBuilder` and `use(fragment)`.** Every builder - the root, an arm, a nested flow,
  a ring's pass - is one chain, `FlowBuilder`; `StepperBuilder` adds the terminals
  `build`/`fork`, `RecurrentStepperBuilder` adds `fold`/`dock`. Every chain method hands
  back the kind it was called on (`Rebound<this, …>`), so a fragment written once against
  `FlowBuilder<TForms, TKinds, TCtx extends Requirement>` reads on any of them, and
  `use(fragment)` applies it keeping the caller's kind. A chain that does not meet the
  requirement is refused where the fragment is applied.
- **`FlowDock.amend(update)`.** A dock rewrites the ring's state without opening a pass
  (drop an entry, mark one for editing before `restart()`); `completeWhen` and
  `dockReachable` read the new state. `StepperController.dockAmend` behind it.
- **A branch's arm is a full chain.** It may `createForm`, `withState`, `provide`, nest a
  flow or a fragment; its pool, state, providers and control kinds merge into the level's.
- **A nested flow may fork.** `createStepper`'s callback returns a `Branch`; the slot's
  entry is the flow's egress, a fork's union included.

### Changed

- **The templates left the core; the package is entry points now.** `ngx-formad/core` is
  the library proper (config, layout, form, stepper, the adapter contracts, `cssLayout`),
  and the package root `ngx-formad` re-exports it, so `import from 'ngx-formad'` keeps
  working and weighs the same. Everything presentational is its own entry point, paid for
  only when imported: **`ngx-formad/template`** (the plain-HTML formFields,
  `defaultControls`), **`ngx-formad/chrome`** (`DefaultStepperChrome`),
  **`ngx-formad/tailwind`** (`tailwindLayout`), beside the existing `ngx-formad/material`.
  On disk that is 132 kB of core against 36, 16 and 4 kB of templates. One consequence for
  typing: an application that augments `ControlComponents` must now write
  `declare module 'ngx-formad/core'`, the module that declares the interface; an
  augmentation of `'ngx-formad'` no longer reaches it, and every field of that kind falls
  back to the "no component is registered" refusal.
- **BREAKING: `provideFormadSuite` has no default controls and no default chrome.** The
  core cannot reach into a secondary entry point, so the built-in fallbacks are gone.
  Without `controls`, the first formField throws a message naming the fix
  (`provideFormadSuite({ controls: defaultControls })` from `ngx-formad/template`,
  `materialControls`, or an adapter of your own); without `stepper`, the first
  `<ngx-formad-stepper>` does the same for `ngx-formad/chrome`. `layout` keeps its
  `cssLayout` default. `controlTypes` given without `controls` layers over nothing: only
  the listed kinds exist. An application that already provides all three axes is
  unaffected; one that leaned on the defaults adds two imports.
- **The core is laid out as modules, each with its own `types/`.** `types`, `layout`,
  `content`, `controls`, `shared`, `form`, `stepper`, with imports running only downward
  and one `index.ts` per module deciding what is public. Type names are unchanged; a few
  members reached the surface because a neighbouring module needs them through the
  barrel: `buildLevel`, `mountInjector`, `MountPoint`, `isLevel`/`isItems`, `ModelKeys`/
  `ModelVal`, the `SHARED_STATE` token (the stepper's store, for a form instantiated
  inside one without being handed a store) and `noControls`, the refusing registry.
  `StepperBuilder` is split into `page-builder`, `step-builder`, `branch-builder` and
  `stepper-builder`; the controller's progress types live in `stepper/types/controller`.
- **`isLevel` / `isItems` take `FieldLeaf | FieldLevel | FieldItems`.** On Angular 22 a
  `FieldTree<unknown>` is not a supertype of the other two, so the narrower predicate did
  not type-check in an application without `skipLibCheck`.
- **BREAKING: `StepInstance` takes one type parameter.** The pool it carried in front of
  the placed forms was phantom: the mapped body reads `P` alone, so every step entry
  printed the whole form pool beside its own instances. `StepInstance<TForms, P>` is
  `StepInstance<P>`; the type a step resolves to is unchanged, only its spelling, and an
  application that spelled the alias by hand drops the first argument. On a wizard with
  ten pooled forms the hover of a half-built chain fell from 18.5k to 5k characters.
- **The context layers instead of nesting.** `WithSteps` and `WithShared` no longer
  re-instantiate `StepperContext` at every step; they lay the new slice over the context
  (`TCtx & { readonly steps: E }`), and the step-adding methods of `StepperBuilder`
  materialize that record inline, so a chain's context reads as one record of step names
  instead of a stack of `WithSteps<WithSteps<...>>`. What a gate sees is unchanged, and so
  is what a constraint accepts: a step is matched by name wherever in the chain it was
  added. The flow boundaries keep their old shape, because `GateContext`, `ChildContext`
  and `RingContext` replace `steps`, `parent` and `flow` rather than adding to them, and
  an intersection there reduces the context to `never`. The materialization has a price:
  a chain of bare `createStep` calls meets `TS2589` between 40 and 80 steps, where the
  nested form met it between 80 and 120.
- **A fork's egress is the chosen arm's committed steps under its key**, `{ a: Ea } | { b: Eb }`,
  a nested fork's union nested under its arm's key. `result(...)` is gone: the arm's name
  is the discriminant, and mapping the record into a payload is the host's, on `completed`.
- **A flow's egress is one thing.** `completed` on a linear root carries the committed record
  (it was `null`); a fork's `resolveResult(ctx, committed)` is asked over the live context
  and the committed values, once the flow stands on its last step. A fork's selector reads
  the same typed context a gate does - a predecessor before the fork is present, not optional.
- **`StepValues` passes a non-record entry through.** A ring's accumulator or a nested flow's
  egress in the committed record is typed as it is, not mapped member by member.
- **Types moved out of the classes.** `Branch`, `ForkResult`, `BranchAdded`, `Egress`,
  `CommittedOf`, `BuiltFlow`/`BuiltRing`, `RuntimeStepper`, `ChainState` and the
  `FormsOf`/`KindsOf`/`ContextOf` readers live in the stepper's `types/`; the classes each
  in a file of their own. `RuntimeStepper` is the `BuiltFlow` interface now; a built
  `Stepper` is assignable as before.

### Removed

- `defaultControls`, `DefaultStepperChrome` and `tailwindLayout` are no longer exported
  from `ngx-formad`; see the entry points above.
- `BranchBuilder`, `ForkArmBuilder`, `ForkArm`, `ArmState`, `TerminalForkBuilder`,
  `GateContext` and `StepperBuilder.result(...)`. An arm is a `StepperBuilder`; what it
  returns is a `Branch`.

## 0.10.2

### Added

- **A form given at the page - `addForm(name, template, cfg?)`.** A page may place a
  template of its own under a name, next to the pool: a config or a loader for one,
  exactly what `createForm` takes. It is keyed, typed and committed by that name like a
  pool entry - `ctx.steps.<step>.<name>` reads it - and the pool stays for what several
  steps share. Two arms of a branch may thus place their own variant under one name.
  A step's instances key by name, so a step placing one name twice is refused as it is
  built.

### Changed

- **A step gate is asked only once its predecessors are entered.** `effectiveSteps`
  used to ask every `activeWhen` on every recomputation, from the first render on -
  so a gate reading `ctx.steps.basics.basics.model()` met `undefined` before the
  wizard had shown a single step, and `GateContext` made every entry of `steps`
  optional to say so. The sequence is now decided in order up to a *front*: the first
  listed step not yet entered. Gated steps before it are decided; gated steps past it
  are *undecided* - off the rail, out of `total`, their gates unasked - until
  navigation reaches them. Ungated steps are listed throughout, no decision being
  pending on them. A gate therefore finds what its type promises: an ungated
  predecessor is there, a gated one is `| undefined` because it may have been
  skipped, never because it has not been reached. `StepCondition` and `BranchSelect`
  take the typed context itself; `GateContext` remains for a fork's selector and arm
  results, which the flow's `result` may resolve early. `effectiveSteps(steps, ctx,
  entered)` gains the third argument. A rail therefore grows as a gated section is
  reached rather than showing it from the start. Inside a branch arm the same promise
  holds one level down: an arm's earlier step reads as present to the arm's later steps
  and nested selectors (it ran, or they would not be asked), and as `| undefined` only to
  what comes after the branch.
- **A branch's selector is asked once per walk.** Every arm compiles to its own gate,
  and each used to call the selector for itself - N arms, N calls per recomputation,
  on top of the walk a landing makes before the computed one. The arms of one branch
  now share a decision: `effectiveSteps` hands every gate one context object per walk
  of the sequence, and the branch remembers what the selector said for it. The
  controller walks less as well: the decided sequence depends on the live steps, not
  on the cursor, so moving between steps already alive decides nothing again, and a
  landing reuses the decided sequence instead of walking once more before it.

## 0.10.1

### Added

- **Recurrent steppers - `createRecurrentStepper` / `RecurrentStepperBuilder`.** The
  0.8.0 note admitted that a loop ("add another device, then the same three steps
  again") "ended up as a second stepper nested inside a step". It no longer does: a
  recurrent stepper is a flow abstraction equal in rank to the linear one - a ring
  of *pass steps* around a *dock*. Finishing a pass folds its values into the flow's
  own state through the author's pure `fold` and lands on the dock; the dock can only
  reopen the ring or complete the flow. State is the flow's own: `state: () => C`
  declares the accumulator, it lives inside the ring as `ctx.flow.state()` (a dock
  hands it to its components through `addComponent`'s bindings callback), and nothing
  outside mutates it. Entry is conditional -
  a state for which `dockReachable` holds lands on the dock, any other opens a pass on
  its first step (without `dockReachable`, the dock is reachable once a pass has
  folded) - and validity derives from the state (`completeWhen`), never from the path
  taken. A ring built at the root (`new RecurrentStepperBuilder({ state })`) goes
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
  `FormState` (`.model()`, `.rootForm`) — typed by accumulation along the chain,
  `| undefined` when the step is gated (`activeWhen`, a branch arm, a pass). Unnamed
  steps are reachable by authored index only, which is fragile under reordering: name
  any step another one reads. `ctx.shared` is the store as one signal per key (the
  GLOBAL channel, `fieldValueBindings`' counterpart), and a nested flow keeps its own
  namespace of step names, reaching the level above through `ctx.parent`. Everything in
  the context is live: `activeWhen`, `completeWhen`, a branch selector, a fold and a
  step built on entry all read the same reactive tree — no snapshots.
- **Local seeding - `addForm(name, { initial: (ctx) => Partial<M> })`.** The LOCAL
  channel from a predecessor's live instance into this form, applied once, when the
  step comes to life; an `undefined` entry leaves the field's own default alone.
  A shared link (`fieldValueBindings`) stays the global one.
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
- **Pages built on entry - `pages: StepPages.OnEntry`.** `createStep((step, ctx) => ...,
  { pages: StepPages.OnEntry })` makes the step's STRUCTURE follow the live context: the
  callback runs when the step is reached (a pure factory over the entry context), so
  which pooled forms it places and what prose it shows can depend on the user's earlier
  answers. The option is the switch, not the callback's arity: a callback that takes
  `ctx` under the default `StepPages.Once` is refused at compile time (an overload whose
  refusal names the option) and at build time. In-form
  conditionality stays `hidden()`/`visibleWhen` — building on entry covers only what
  those cannot: the page's structure.
- **A page node bound and gated on the step context — `addComponent(Cmp, { bindings:
  (ctx) => [...], visibleWhen: (ctx) => … })`.** `bindings` takes a callback over the
  step's typed context beside the plain `Binding[]`, so a component on an ordinary step
  binds to what earlier steps hold: a dock reads its ring with `(ctx) =>
  [inputBinding('devices', () => ctx.flow.state())]`, a later step reads a predecessor
  with `ctx.steps.basics.basics.model()`. The callback runs once, when the step is
  materialized, over a context of getters (`ComponentBindings`,
  `ComponentNode.bindings(ctx)`): read the context *inside* the binding's own getter and
  the input follows the live tree afterwards, a predecessor rebuilt by
  `StepRevisit.Fresh` included. **`visibleWhen` takes the same context** everywhere a
  page has one — `addComponent`, `addForm`, `addContent`, `insertRow` and `createPage`
  itself — and stays what it was: a `computed` the renderer `@if`s on, so it follows
  what it reads. `LiveStep.context` carries that context to the page renderer.
  `pages: StepPages.OnEntry` is left to what it is for — a page whose STRUCTURE depends
  on the context, not one input or one gate that does.
- **Gates on the containers, and they count — `insertRow(build, { visibleWhen })`,
  `createPage(build, { visibleWhen })`.** Every leaf of a page could be gated and
  no container could, so one condition had to be repeated on each child. A row and a
  page now take the same gate (`RowCfg`, `PageCfg`, `RowNode.visibleWhen`,
  `PageOptions.visibleWhen`), and a container's gate travels with its children into the
  completion fold: a form inside a hidden row, or on a hidden page, is not drawn and
  does not hold Next either, so a required field nobody can see cannot block the wizard.
  The page renderer no longer treats a row as unconditional.
- **Refusals that name the fix.** Three mistakes that used to fail far from their cause
  are refused where they are made, with a `Rejected<...>` naming the fix: bindings for a
  field whose kind is unknown, not exact (a wide `ui`, an annotation `: FormConfig<M>`)
  or has no component in `ControlComponents`; a `customField()` without a `control()`
  placement - the check walks groups and array items, and a `customField()` nested in
  one is refused outright, since no `control()` reaches it - in `defineForm`,
  `instantiateForm` and `createForm`; and `createPage(options, build)` with the arguments
  the other way round. Each refusal sits on the argument that made the mistake, so the
  error is reported at that call and not at the next one in the chain.
- **Binding names checked against the component, in dev mode.** A name bound as an input
  that the component declares as an output (or the other way round) throws when the form
  is instantiated, naming both sides; a name the component declares nowhere is a warning,
  since host directives and inherited metadata put some names beyond the mirror.
- **`SharedState` no longer needs `structuredClone`.** The store copies what it stores
  through the platform's `structuredClone` where it exists and a structural walk (arrays,
  dates, maps, sets, plain objects) otherwise, so importing the package no longer throws
  in an environment without it - a jsdom test environment, for one.
- **`formLayout().omit(...keys)` and the unplaced-field warning.** An overlay draws only
  what it names; in dev mode a form says once per layout which fields of `ui` it neither
  places nor omits on purpose.
- **Flow providers - `provide(...)` on both builders.** A wizard is its own
  injection environment: the providers declared at the flow's definition become an
  `EnvironmentInjector` (a nested flow's inherits its parent's, the root inherits
  the application's), torn down with the wizard. Step components resolve them
  directly — a page component stays clean, injecting what the flow declared
  instead of taking wired inputs — and author callbacks (`activeWhen`, `completeWhen`,
  pages built on entry, `fold`, branch selectors, result resolvers) run inside the flow
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
  is instantiated. A `content()` gate inside a form reads the form context
  (`{ model, ui, fields }`), never the field tree and never the store.
- **Bindings - one place per form instance.** Everything a field's component is bound
  with beyond `FormField` (inputs, outputs, two-way) is declared in the second argument
  of `instantiateForm(config, bindings, effects?)` and in
  `addForm(name, { componentBindings })`: a record keyed by field name, under it
  `inputs` and `outputs` keyed by the component's own names, typed by the component the
  layout placed or by the one `ControlComponents` (a new, augmentable interface: kind →
  component class) registers for the field's kind.
  An input is a static value, an output a handler `(payload, ctx)`, and anything reactive
  is Angular's own `bindings: [inputBinding(...)]` on the same entry. `ctx` is the form's
  writable `model`; inside a stepper the step context with `model` layered in
  (`StepFormContext`), read again on every emission, so `ctx.steps` names the steps alive
  then and not those alive when the step was entered (`InstantiateOptions.context` and
  `MaterializeOptions.context` take a getter; an effect reads it untracked, so an effect
  follows the signals it reads and not the flow's navigation). A group nests its record,
  a repeating group binds every item.
- **Effects - Angular `effect()`s over a live form.** `instantiateForm(config, bindings,
  effects)` and `addForm(name, { effects })` take `(ctx) => void` side effects,
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
- **A config value that changes is a `Signal<T>`.** `FormConfig` widens the authored ui
  with `SignalUiConfig<M>`, so any presentational prop (`label`, `placeholder`,
  `options`, a date's `limit`, a textarea's `rows`, a file field's `accept`) accepts
  `T | Signal<T>`; page headings, step labels and content text take the same shape. A
  bare closure is not one of them, and a custom kind's `props` stay static — structure,
  not presentation. A prop is taken in once, where the field mounts: a plain value is
  wrapped in a `signal()` there and everything downstream holds a `Signal<T>` and calls
  it. formodel stays plain: 0.3.0 carries no reactive type at all.
- **`GridPlacement.colStart`** and `formLayout().row(build, { cols, gap, colSpan,
  colStart })` - a row's own grid plus its placement in the parent grid. `LayoutItem`
  (`[ngxFormadItem]`) puts a placement's class and style on the element it sits on;
  the renderer attaches it to every placed formField.

### Removed

- **`addForm`'s `submitLabel`.** It was authored, stored on the node and read by
  nothing: the chrome owns its buttons.
- **The bare content slot.** `addContent()` with no build callback drew an empty layout
  slot; a slot that holds nothing is not a thing a page needs, and spacing is the
  layout's business, not a node's. `build` is now required, as it always was in
  `formLayout().content(build)`.
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
  `fieldValueBindings: (f, s) => [link(f.company, s.company)]`;
  `effects: (e) => e.on((m) => m.taxId, 'resolved', handler)` is `componentBindings:
  { taxId: { outputs: { resolved: handler } } }`. `SharedLink`, `selectedKey` and
  `OutputHandler` go with them; every replacement is checked against the model and the
  shared keys exactly as the callbacks were.
- **`asRenderable`, `asStepper` and `StepperResult`.** A `FormState<M, U>` is what
  `<ngx-formad-form [state]>` takes and a built `Stepper` or `RecurrentStepper` is
  what `<ngx-formad-stepper [stepper]>` takes; the erasure is assignability, not a
  call. A result type is read off the built stepper's own generic.
- **`FormRenderer`'s `[layout]` and `[effects]` inputs.** The grid is part of the state
  (`FormState.grid`, the view's container classes) and a field's bindings are wired when
  the form is instantiated (`instantiateForm(config, bindings)`).
- **`addForm({ effects })` as output handlers, `control({ bindings })`, and
  `addComponent({ inputs, outputs })`.** What a field is bound with lives in ONE place
  per abstraction - the bindings argument of `instantiateForm`, `componentBindings` on
  `addForm` - so the layout's `control()` no longer takes `bindings` and the old
  `effects` record
  (`{ field: [{ output, handler }] }`) is the field's own output key inside that
  argument. `OutputEffectCfg`, `FormEffects`, `EffectRecord`, `OutputEffect`,
  `recordEffects`, `toBindings`, `ComponentInputs` and `ComponentOutputs` go with it; a
  page component takes Angular's own `Binding[]` (`addComponent(Cmp, { bindings })`), so
  `ComponentCfg` no longer carries the component's type parameter.
  `effects` now means an Angular `effect()` over the form.
- **The outlets and the sync helpers** — `FieldOutlet`, `ComponentOutlet`,
  `BoundOutputEffect`, `samePath`, `SyncField`, `seedFromShared`,
  `commitToShared`, `fieldSync` and `SharedState.slot()`. The mount replaces the
  outlets; a `LiveForm` seeds and commits its own links through the field tree, and
  `SharedState.select(key)` / `signals()` are the per-key signals. (`SharedSlot` is
  back under the same name for a different job: the typed store slot `link()` takes.)
- **`ReactiveValue`, `readReactive`, `mapReactive` and `reactive`.** A prop that may
  follow a signal is `T | Signal<T>` — Angular's own type — so there is nothing left to
  unwrap and no helper to thread a signal through formodel's plain builders: author the
  field as a literal node instead.
- **`stepFormNames`.** `formNodes(pages)` lists the form nodes the pages place.

### Changed

- **`fieldValueBindings` carries its path and key under registered symbols, and `link()`
  says no to a copy.** `FieldRef` and `SharedSlot` keep them under `Symbol.for(...)`, so
  no model field or store key shadows them and two loaded copies of the library still
  agree; the reference proxy answers a field name and nothing else, and `link()` throws
  where a spread reference lost the carrier instead of failing at step entry.
- **A signal is text wherever a tag takes text.** `c.p('You picked ', chosen)` and
  `c.p({ className }, chosen)` keep working: a signal in the slot after the text or the
  options is text, as the renderer always drew it.
- **`omit()` stays a view concern.** An earlier attempt to make it exempt a
  `customField()` from `control()` also switched that refusal off everywhere it was
  carried by a layout, so it is reverted: `omit()` silences the unplaced-field warning,
  the field still validates, and the exemption would need the omitted keys threaded
  through `FormConfig`. A row's own `omit()` now reaches the layout that holds it, where
  it used to be dropped.
- **Tailwind instead of a shipped stylesheet — `tailwindLayout`.** The class adapter
  and the SCSS generator are gone (`classLayout`, `ngx-formad/styles`): the responsive
  adapter now composes Tailwind's own utilities, so the build emits exactly the classes
  the configs name and the library ships no CSS at all. `cssLayout` stays the
  zero-dependency default. One `@source inline(...)` line tells Tailwind about the
  names composed at runtime; the README carries it.
- **Policies are enums, not flags or unions.** `dynamic: true` is `pages:
  StepPages.OnEntry` (`StepPages.Once` is the default and what a plain step does), and
  the built-in control kinds are the `ControlKind` enum instead of a string union.
  `RingCfg.dockReachable` is a property like its `state` neighbour, and the phantom
  members that carry a builder's placements say so in one convention.
- **Three contexts that build on one another.** The old step context is
  `StepperContext` (`steps`, `shared`, `flow`, `parent`) and `RuntimeStepContext` is
  `RuntimeStepperContext`; one level in, a step's own callbacks read
  `StepContext<TCtx, TForms>` — the same plus **`ctx.forms`**, the instances that step
  placed, so a gate no longer has to name its own step to read its own forms. One
  `FormContext<M, U>` (`model: WritableSignal<M>`, `ui`, `fields`) replaces
  `FormLayoutContext`, the old `FormContext` and `WritableModel`, so `model` means one
  thing everywhere and a layout gate reads `ctx.model().field`; the store no longer
  rides in the form context — reaching it is the placement's job, where its keys are
  typed.
- **One config per owner, with the flags that owner can honour.** `StepOptions` is
  `StepCfg`, `FlowStepOptions` is `FlowSlotCfg`, and `when` is **`activeWhen`** — three
  words for three jobs, read plainly: `activeWhen` (in the sequence), `visibleWhen` (in
  the DOM), `completeWhen` (contract met). The dock has its own `DockCfg` without
  `activeWhen`, `optional` or `revisit`: it is the ring's only exit, so gating it away,
  skipping it or rebuilding it behind the user makes no sense. The ring's
  `completeWhen(state, message)` is gone with it — the flow's contract is the dock's
  `completeWhen` over `ctx.flow.state()`, and a nested slot derives no guard of its own.
  A ring's accumulator starts from `state`, since `initial` means one thing: a form's
  seed.
- **A placement binds two named things, neither by string.** `addForm`'s `bindings` is
  `componentBindings` (what a field's component gets) and `bind` is
  `fieldValueBindings` — a callback over typed field references and store slots joined
  by `link`: `fieldValueBindings: (f, s) => [link(f.email, s.email)]`. `SharedLinks`,
  `SharedKeyFor`, `LinkRecord` and `recordLinks` are gone; `FieldRefs`, `SharedSlots`,
  `FieldRef`, `SharedSlot` and `link` replace them, and a renamed field or key is a
  compile error instead of a link that silently stops matching.
- **A field's `inputs` are static; a reactive one is Angular's own binding.**
  `FieldInputs<C>` is typed by the component's input type, so `inputs: { label: 'VAT ID'
  }` is data. A value that changes uses the other signature — `bindings:
  [inputBinding('options', theSignal)]` on the same field entry, the same `Binding[]`
  vocabulary `addComponent` takes — so nothing in the renderer has to ask whether an
  input arrived as a value or as a signal.
- **`ReactiveUiConfig` is `SignalUiConfig`, `ReactiveControlNode` is
  `SignalControlNode`.** The widening now says what it does: every control prop accepts
  `T | Signal<T>`, and `extraInputsFor` returns signals, which the mount binds as they
  are.
- **`BranchBuilder.step` is `createStep`, and a row's layout class moved into its
  config.** One act, one name on every builder; `insertRow(build, { layout, visibleWhen
  })` puts the class where every other node carries it, and optional, since a row that
  only groups needs no class.
- **`addForm(name, cfg)` — one argument object, no `null` in the middle.** A placement's
  bindings are a field of the config (`bindings`) instead of a second positional
  argument, so `addForm('details', null, { initial })` is `addForm('details', {
  initial })` and `addForm('f', { taxId: … })` is `addForm('f', { bindings: { taxId: …
  } })`. `FormCfg` is now keyed by the POOL ENTRY (`FormCfg<TForms[K], TCtx>`), since it
  types the bindings by the template's `ui` and its `control()` placements, as the
  separate argument did.
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
  `environment`, `injector?`, `entry`, `context?`). `LiveStep` gains `components`,
  `instances` and `context`; `LiveForm` gains `visible`, `issues`, `reseed(ctx)`,
  `touch()` and `destroy()`.
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
