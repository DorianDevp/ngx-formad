# ngx-formad

Config-driven rendering and multi-step orchestration for Angular
[signal forms](https://angular.dev/guide/forms/signals). You describe a form — or
a whole multi-step wizard — as data, and one generic renderer walks it and emits
the DOM. How fields look (Material, PrimeNG, plain HTML) and how the layout
resolves (Tailwind, CSS grid, nothing) are pluggable adapters, configured once.

Works with **Angular 21.2+ and Angular 22**, on the experimental
`@angular/forms/signals` API. The slice of that API this library uses (`form`,
`FieldTree`/`FieldState`, `FormField`, `FormValueControl`, `createComponent`
bindings) is identical across both majors, so one package covers both: it is
built with the Angular 21 toolchain, which the partial-compilation linker in any
Angular ≥21 app finalizes — so a v22 app consumes the same artifact a v21 app
does. The only runtime dependency is
[`formodel`](https://www.npmjs.com/package/formodel), which supplies the typed
form description this library renders.

## Is this for you?

The one thing native does not do is **render**. It is headless — you hand-write
the template for every form, and even `hidden()` only hands you a signal; you
still write the `@if` yourself. ngx-formad exists for the two things native
leaves to you:

1. **Config-driven rendering.** Declare the fields, their layout, their
   visibility, and which dynamic component appears when — as data. The renderer
   produces the DOM: it auto-`@if`s on visibility, instantiates controls and
   components from config, and applies the layout adapter. You stop writing
   templates.
2. **Multi-step orchestration.** Navigation, a step-completion fold, and
   cross-step shared state with directional autofill. Native attempts none of it.

**Use it if** you render many forms *from configuration* because they are
numerous, structurally similar, conditional, or multi-step — the Formly
audience.

**Skip it if** you are building one bespoke form. Native signal forms plus a
hand-written template will be smaller and clearer, and this adds nothing.

## Install

```bash
pnpm add ngx-formad formodel
```

`@angular/core`, `@angular/common`, and `@angular/forms` are peer dependencies.

## Quick start

Describe one form with formodel, hand it to the renderer.

```ts
import { Component } from '@angular/core';
import { UiFormConfigBuilder, email, text } from 'formodel';
import { FormRenderer, instantiateForm, asRenderable, FormConfig } from 'ngx-formad';

type Account = { email: string; name: string };

const accountForm: FormConfig<Account> = {
  model: () => ({ email: '', name: '' }),
  ui: UiFormConfigBuilder.from({ email: '', name: '' })
    .email(email('Email'))
    .name(text('Name')),
};

@Component({
  imports: [FormRenderer],
  template: `<ngx-formad-form [state]="state" [layout]="{ cols: 2, gap: 4 }" />`,
})
export class AccountPage {
  // `instantiateForm` calls `form()`, so it runs here, in an injection context.
  readonly state = asRenderable(instantiateForm(accountForm));
}
```

**What that renders** — two native controls in a CSS grid, no adapter
dependencies, no stylesheet, no build step:

```html
<div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem">
  <div><label class="ngx-formad-field"><span>Email</span><input type="email"></label></div>
  <div><label class="ngx-formad-field"><span>Name</span> <input type="text"></label></div>
</div>
```

(Each control actually sits in its own `<ngx-formad-field-outlet>` host element —
elided above for readability; the `label`/`input` markup is exactly what the
default control emits.)

```
┌ Email ───────────────┐  ┌ Name ────────────────┐
│                       │  │                       │
└───────────────────────┘  └───────────────────────┘
```

Ugly, working, and the broadest possible entry point. The `state` also exposes
the live `rootForm` field tree, so validation and field state stay 100% native.

## Validation is native — and it shows

Attach a standard signal-forms `schema`. The renderer does nothing special with
it; the field tree validates, and the default control prints the message inline
once the field is touched.

```ts
import { email, required } from '@angular/forms/signals';

const accountForm: FormConfig<Account> = {
  model: () => ({ email: '', name: '' }),
  ui: /* …as above… */,
  schema: (p) => {
    required(p.email, { message: 'We send the confirmation here.' });
    email(p.email, { message: "That doesn't look like a valid e-mail." });
    required(p.name, { message: 'Your name is required.' });
  },
};
```

**What the user sees** after typing `not-an-email` into Email and blurring:

```html
<label class="ngx-formad-field">
  <span>Email</span>
  <input type="email" value="not-an-email">
  <small class="ngx-formad-error">That doesn't look like a valid e-mail.</small>
</label>
```

```
┌ Email ──────────────────────────┐
│ not-an-email                     │
└──────────────────────────────────┘
 ⚠ That doesn't look like a valid e-mail.
```

Because the errors live on the native field tree, you can also read them
yourself — `state.rootForm` is the `FieldTree`, so `rootForm.email().errors()`,
`.valid()`, and `.touched()` are all there for a summary panel, a submit gate, or
a progress fold. The live examples below do exactly that.

## The two adapter axes

Rendering is split into two orthogonal axes, each swapped once through the
provider. The core ships a zero-dependency default for both.

```ts
import { provideStepperSuite } from 'ngx-formad';

bootstrapApplication(App, {
  providers: [
    provideStepperSuite({
      // controls: kind -> a native FormValueControl component
      // layout:   spec -> classes or styles
    }),
  ],
});
```

- **Control adapter** maps a field's kind (`'text'`, `'select'`, …) to a native
  `FormValueControl` component.
- **Layout adapter** maps a layout spec to classes or styles.

The same `[layout]="{ cols: 2, gap: 4 }"` spec produces different output per
adapter — your config never changes:

| Adapter            | What the container element gets                                            |
| ------------------ | -------------------------------------------------------------------------- |
| default (CSS grid) | `style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem"` |
| a Tailwind adapter | `class="grid grid-cols-2 gap-4"`                                           |

Because the axes are orthogonal, a Material control adapter sits happily inside a
Tailwind layout — Material does not own layout.

## Multi-step wizards

One typed chain describes the forms, the steps, the dynamic components, and the
cross-step shared state. The form pool is typed: `addForm(f => f.account)` and
`bind` are checked against the forms you actually declared.

```ts
import { StepperBuilder, asStepper, StepperComponent } from 'ngx-formad';

const wizard = new StepperBuilder()
  .withState({ email: '' })
  .createForm('account', accountForm)
  .createForm('billing', billingForm)
  .createStep((step) =>
    step.createPage({ options: { heading: 'Account' } }, (page) =>
      page.addForm((f) => f.account, {
        bind: (l) => l.link((m) => m.email, (s) => s.email),
      }),
    ),
  )
  .createStep((step) =>
    step.createPage({ options: { heading: 'Billing' } }, (page) =>
      page.addForm((f) => f.billing, {
        // Same shared key — billing's email is prefilled from step 1.
        bind: (l) => l.link((m) => m.email, (s) => s.email),
      }),
    ),
  )
  .build();
```

Render it with the included shell:

```ts
@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
export class Checkout {
  readonly stepper = asStepper(wizard);
}
```

**What happens at runtime:** the shell shows the Account step with its heading and
a Next button gated on the step being valid. Type `a@b.com` into Account's email
and click Next — Billing opens with its email **already filled in** as `a@b.com`,
because both fields link the same shared key. Change it on Billing and it stays
changed if you navigate back and forth; the prefill never clobbers a typed value.

### Directional autofill

A value entered in one step prefills a bound field in a later step — and never
clobbers something the user typed. The sync is deliberately **not** a two-way
binding (those oscillate). It is directional and discrete:

- **shared → field**, on step entry, only while the field is pristine. Upstream
  changes still flow into fields the user hasn't touched; an entered value is
  left exactly as typed.
- **field → shared**, on a commit event (the step's Next / Back), once — not on
  every keystroke, and not through a standing subscription.

Because entry and commit are the only edges, there is no reactive back-edge and
nothing can oscillate. The pristine gate reads the native `dirty()` flag, and the
seed writes through the field's value signal — a programmatic write, which (per
the [field state docs](https://angular.dev/guide/forms/signals/field-state-management))
does not mark a field dirty, so a seed never trips its own gate.

## API reference

The public surface, grouped by what it does. Everything is exported from the
package root (`ngx-formad`).

### Render a single form

| Symbol                          | What it is                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| `FormConfig<M>`                 | A form as data: `{ model: () => M; ui: UiFormGroupConfig<M>; schema?: SchemaOrSchemaFn<M> }`. |
| `instantiateForm(config)`       | Turns a `FormConfig` into live `FormState` (calls native `form()`; run in an injection context). |
| `FormState<M>`                  | `{ model: WritableSignal<M>; rootForm: FieldTree<M>; fields: FieldConfig[] }` — the live tree + the flat field list. |
| `asRenderable(state)`           | The single, named widening from `FormState<M>` to the erased view the renderer consumes.     |
| `FormRenderer`                  | The `<ngx-formad-form [state] [layout] />` component. Draws one form; pure view, no `form()` call. |

### Author a multi-step wizard

| Symbol                          | What it is                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| `StepperBuilder`                | The fluent chain. Methods narrow the type as you go (see below).                             |
| `Stepper<TForms, TShared>`      | The built wizard: `{ forms, steps, shared }`.                                                |
| `asStepper(stepper)`            | The single, named widening from the typed `Stepper` to `RuntimeStepper`.                     |
| `RuntimeStepper`                | `Stepper` with its pool/shared types erased — what the runtime and shell consume.            |
| `SharedLink<M, S>`              | The `bind` recorder: `.link(m => m.field, s => s.key)` ties a model field to a shared key.   |
| `StepperComponent`              | The bundled `<ngx-formad-stepper [stepper] />` shell — navigation, progress, the sync edges. |

### Run it yourself (bring-your-own-UI)

| Symbol                                       | What it is                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| `materializeStep(step, pool, shared, inj)`   | Instantiates a step's forms, registers them, wires the sync. Returns a `LiveStep`. |
| `LiveStep` / `LiveForm`                      | `LiveStep = { registry, forms }`; `LiveForm = { name, state, seed(), commit() }`. |
| `InstanceRegistry`                           | Collects a step's live forms; `completed()` folds `valid()` over the visible ones. |
| `SharedState<S>`                             | The plain-signal cross-step store; `get(key)`, `patch(partial)`, `select(key)`, `slot(key)`. |

### Configure the look (call once)

| Symbol                          | What it is                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| `provideStepperSuite(opts?)`    | Registers the adapters. No args = zero-dependency defaults (plain HTML + CSS grid).          |
| `ControlAdapter` / `LayoutAdapter` | The two pluggable axes; `defaultControls` and `cssLayout` are the shipped defaults.       |

## How the builder shapes the build

`StepperBuilder` is one fluent chain, and every method moves the type forward —
the form pool and the shared-state shape are tracked in its two generics
(`StepperBuilder<TForms, TShared>`), so `addForm`/`bind` are checked against the
exact forms and keys you declared. Read the comments as the inferred type *after*
each call:

```ts
new StepperBuilder()
//   StepperBuilder<{}, {}>
//   — empty form pool, empty shared state.

  .withState({ email: '', nip: '' })
//   StepperBuilder<{}, { email: string; nip: string }>
//   — declares the cross-step shared store; narrows TShared. (One per chain.)

  .createForm('account', accountForm)        // accountForm: FormConfig<Account>
//   StepperBuilder<{ account: FormConfig<Account> }, { email: string; nip: string }>
//   — registers a form in the typed pool under 'account'; narrows TForms.

  .createForm('billing', billingForm)        // billingForm: FormConfig<Billing>
//   StepperBuilder<{ account: FormConfig<Account>; billing: FormConfig<Billing> },
//                  { email: string; nip: string }>

  .createStep((step) =>
    step.createPage({ options: { heading: 'Account' } }, (page) =>
      page.addForm((f) => f.account, {
        //          ▲ f: FieldRefs<{ account; billing }> — only declared forms autocomplete
        bind: (l) => l.link((m) => m.email, (s) => s.email),
        //            ▲ m: Account (the *selected* form's model)   ▲ s: { email; nip }
      }),
    ),
  )
//   StepperBuilder<…unchanged…>
//   — createStep returns `this`; steps accumulate as a plain data tree, they do
//     not change the type. The callbacks are where the generics are *read*.

  .build();
//   Stepper<{ account: FormConfig<Account>; billing: FormConfig<Billing> },
//           { email: string; nip: string }>
```

So `build()` produces a `Stepper` whose shape is everything the chain accumulated:

```ts
class Stepper<TForms, TShared> {
  readonly forms: TForms; //  the typed pool, keyed by name:
  //                          { account: FormConfig<Account>; billing: FormConfig<Billing> }
  readonly steps: readonly StepNode[]; //  the plain step/page/node tree the renderer walks
  //                                       (form refs by name, links, visibleWhen, components…)
  readonly shared: SharedState<TShared>; //  the live cross-step store, typed { email; nip }
}
```

Then `asStepper(stepper)` erases those two generics to `RuntimeStepper` for the
shell (`<ngx-formad-stepper>`), or you walk `steps`/`forms`/`shared` yourself with
`materializeStep` — that is exactly the bring-your-own-UI path the live example
takes.

The inner callbacks each have a small, fixed shape:

```ts
createStep((step) => …)                      // step: StepBuilder<TForms, TShared>
step.createPage({ options: PageOptions }, (page) => …)   // page: PageBuilder<…>
page.addForm((f) => f.name, {                // f: FieldRefs<TForms>
  submitLabel?: string,
  visibleWhen?: () => boolean,               // auto-@if'd by the renderer
  bind?: (l: SharedLink<Model, Shared>) => void,
})
page.addComponent(Component, { inputs, outputs, visibleWhen?, layout? })  // typed to the component
page.addContent({ layout? })                 // a bare layout slot
page.insertRow('grid-cols-2', (row) => …)    // a nested PageBuilder
```

## Live examples

A runnable showcase ships in this repo under `projects/examples` — a small
storefront self-service portal with three multi-step flows (Return, Complaint,
Warranty) built on the primitives above. Run it from the workspace root:

```bash
pnpm examples   # builds the library, then serves the example app
```

It demonstrates, end to end:

- **Config-only forms** — every step is a `FormConfig`; the shell renders them.
- **Directional autofill** — the order's Tax ID typed on step 1 arrives
  prefilled on the billing step six screens later, with a "we pre-filled this"
  banner; edit it and the edit sticks.
- **Validation, surfaced two ways** — required / pattern / e-mail / min-length /
  a conditional rule, each with a custom message. Errors show inline on blur, and
  pressing **Continue** on an invalid step reveals a summary that lists every
  offending field by label. Navigation is gated on the native completion fold.
- **A bring-your-own-UI shell** — `WizardHost` is built directly on the runtime
  primitives (`materializeStep`, the instance registry, the sync edges) rather
  than the bundled `StepperComponent`, so it doubles as a worked example of the
  custom-chrome path.

## A note on the experimental API

`@angular/forms/signals` is experimental and has moved before
(`field` → `formField`). The adapter layer is a hedge — an API rename is absorbed
in one adapter rather than across every template — but pin your versions and
expect some churn. The surface this library uses did not change between Angular
21 and 22; should a future major rename part of it, the plan is to split the
release lines at that point (an experimental line and a stable line) rather than
contort one package across an incompatible boundary. If you are new to signal
forms, the
[Angular guide](https://angular.dev/guide/forms/signals) and this
[deep-dive walkthrough](https://angular.love/pl/signal-forms-w-angular-21-kompleksowy-przewodnik)
are good starting points.

## License

MIT
