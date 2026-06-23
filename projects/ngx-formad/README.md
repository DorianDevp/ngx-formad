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

Read this part before installing — it will save you time either way.

Native signal forms already gives you, with no library at all: a typed field
tree from your model, two-way binding, schema validation, field state signals
(valid / touched / dirty / hidden / disabled), conditional logic in the schema,
custom controls via `FormValueControl`, arrays and subforms, and a per-field
metadata channel. So type safety, validation, and state are **not** reasons to
reach for this. They are native, and a library that sells them is just a wrapper
around `form()`.

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

That renders with **zero adapter dependencies** — plain HTML controls in a CSS
grid. Ugly, working, and the broadest possible entry point. The `state` also
exposes the live `rootForm` field tree, so validation and field state stay 100%
native.

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
  `FormValueControl` component. The default is plain HTML; a Material or PrimeNG
  adapter is a different object, not a change to your config.
- **Layout adapter** maps a layout spec to classes or styles. The default emits
  inline CSS grid; a Tailwind adapter returns `grid-cols-*` strings instead.

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
