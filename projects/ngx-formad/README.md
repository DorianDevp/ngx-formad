# ngx-formad — config-driven forms & multi-step wizards for Angular signal forms

**ngx-formad renders Angular forms from configuration.** You describe a form — or
a whole multi-step wizard — as data, and one generic renderer walks that data and
produces the DOM. Field appearance (Material, PrimeNG, plain HTML) and layout
(Tailwind, CSS grid, nothing) are pluggable adapters you configure once. It is the
rendering and orchestration layer that Angular's headless
[signal forms](https://angular.dev/guide/forms/signals) deliberately leave to you.

- 🧩 **Render from config** — fields, layout, visibility, and dynamic components as data.
- 🪜 **Multi-step wizards** — navigation, a completion gate, and cross-step autofill.
- 🎨 **Two adapter axes** — swap controls and layout independently; defaults need zero dependencies.
- 🧪 **100% native validation** — your `schema` runs on the real `FieldTree`; nothing is re-invented.
- 📦 **One peer dependency** — [`formodel`](https://www.npmjs.com/package/formodel), the typed form description it renders.

## Quick look

Describe forms as data; get rendered, validated forms — and sequence them into a
wizard. No templates either way.

**A form** — config in, a rendered form out:

```ts
import { UiFormConfigBuilder, email, text } from 'formodel';
import { FormRenderer, instantiateForm, asRenderable, FormConfig } from 'ngx-formad';

// IN — a form as configuration
const leadForm: FormConfig<{ email: string; company: string }> = {
  model: () => ({ email: '', company: '' }),
  ui: UiFormConfigBuilder.from({ email: '', company: '' })
    .email(email('Email'))
    .company(text('Company')),
};

@Component({
  imports: [FormRenderer],
  template: `<ngx-formad-form [state]="state" />`,
})
class LeadForm {
  state = asRenderable(instantiateForm(leadForm));
}
```

```
OUT — rendered with zero adapters (plain HTML, CSS grid):

┌ Email ────────────────────────────┐
│                                    │
└────────────────────────────────────┘
┌ Company ──────────────────────────┐
│                                    │
└────────────────────────────────────┘
```

**A wizard** — sequence forms into steps; a shared key prefills the next one:

```ts
import { StepperBuilder, asStepper, StepperComponent } from 'ngx-formad';

// IN — two forms sequenced; `Company` typed on step 1 prefills step 2
const wizard = new StepperBuilder()
  .withState({ company: '' })
  .createForm('lead', leadForm)
  .createForm('billing', billingForm) // another FormConfig with a `company` field
  .createStep((step) =>
    step.createPage({ options: { heading: 'Your details' } }, (page) =>
      page.addForm((f) => f.lead, {
        bind: (l) => l.link((m) => m.company, (s) => s.company),
      }),
    ),
  )
  .createStep((step) =>
    step.createPage({ options: { heading: 'Billing' } }, (page) =>
      page.addForm((f) => f.billing, {
        bind: (l) => l.link((m) => m.company, (s) => s.company),
      }),
    ),
  )
  .build();

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class SignupWizard {
  stepper = asStepper(wizard);
}
```

```
OUT — a navigable wizard with a completion gate and autofill:

Step 1 of 2 — Your details                Step 2 of 2 — Billing
┌ Email ──────────────┐                   ┌ Company ────────────┐
│                      │       Next →      │ Acme Inc.           │  ← prefilled
└──────────────────────┘     ───────▶      └──────────────────────┘    from step 1
┌ Company ────────────┐                    ┌ VAT ID ─────────────┐
│ Acme Inc.           │                    │                     │
└──────────────────────┘                   └──────────────────────┘
            [ Back ]  [ Next → ]                       [ Back ]  [ Submit ]
```

Install: `pnpm add ngx-formad formodel`.

## What is ngx-formad?

ngx-formad is an Angular library that **turns a declarative form description into a
rendered, validated form** — and stitches many such forms into a multi-step wizard
with shared state. Angular signal forms are *headless*: they own value, validation,
and field state, but you hand-write a template for every field. ngx-formad supplies
the missing renderer and the multi-step orchestration, while leaving validation and
field state entirely native.

It is built for teams that render **many forms from configuration** rather than
hand-writing each one: **CMS and admin panels** with user-defined content types,
low-code/no-code builders, onboarding and checkout wizards, and survey engines —
the audience that reached for Angular Formly on the reactive-forms stack.

## When should I use it?

**Use ngx-formad if** your forms are numerous, structurally similar, conditional,
JSON/config-driven, or multi-step — because content types, product configurators,
or admin screens multiply faster than you can hand-write templates.

**Skip it if** you are building one bespoke form. Native signal forms plus a
hand-written template will be smaller and clearer, and this adds nothing.

| | Native signal forms | ngx-formad | legacies |
| --- | --- | --- | --- |
| Forms engine | Signals (built-in) | **Native signals** | Reactive forms |
| Renders from config | No (headless) | **Yes** | Yes |
| Multi-step + shared state | No | **Yes** | Add-on |
| Validation | Native | **Native (unchanged)** | Custom layer |
| Signal-forms native | — | **Yes** | No |

## Install

```bash
pnpm add ngx-formad formodel
```

`@angular/core`, `@angular/common`, and `@angular/forms` are peer dependencies.
Works with **Angular 21.2+ and Angular 22** on the `@angular/forms/signals` API
(experimental in 21). One package covers both majors — the slice of the API it uses
(`form`, `FieldTree`/`FieldState`, `FormField`, `FormValueControl`, `createComponent`
bindings) is identical across them, and the Angular-21-built artifact is finalized by
the partial-compilation linker in any Angular ≥21 app.

---

The rest of this guide builds the editor UI of a small **headless CMS** — content
types defined as data, rendered into editor screens and a publishing wizard. You
meet three pieces in order, each one composed from the last: the **form**, the
**page**, and the **stepper**.

## The form

A content type — Article, Author, Product — is just a list of fields. In ngx-formad
that list is a `FormConfig`: a model factory, a formodel `ui` description, and an
optional native `schema`. Hand it to `<ngx-formad-form>` and the renderer draws every
field and keeps a live, fully native field tree behind them. No template, no per-field
boilerplate — this is the atom that the page and the stepper are built from.

```ts
import { Component } from '@angular/core';
import { UiFormConfigBuilder, text, textarea } from 'formodel';
import { FormRenderer, instantiateForm, asRenderable, FormConfig } from 'ngx-formad';

type Article = { title: string; slug: string; body: string };

const articleForm: FormConfig<Article> = {
  model: () => ({ title: '', slug: '', body: '' }),
  ui: UiFormConfigBuilder.from({ title: '', slug: '', body: '' })
    .title(text('Title'))
    .slug(text('Slug', { placeholder: 'my-first-post' }))
    .body(textarea('Body')),
};

@Component({
  imports: [FormRenderer],
  template: `<ngx-formad-form [state]="state" [layout]="{ cols: 2, gap: 4 }" />`,
})
export class ArticleEditor {
  // `instantiateForm` calls native `form()`, so it runs here, in an injection context.
  readonly state = asRenderable(instantiateForm(articleForm));
}
```

With no adapters configured this renders native HTML controls in a CSS grid — no
stylesheet, no build step:

```
┌ Title ────────────────┐  ┌ Slug ─────────────────┐
│                        │  │ my-first-post          │
└────────────────────────┘  └────────────────────────┘
┌ Body ──────────────────────────────────────────────┐
│                                                     │
└─────────────────────────────────────────────────────┘
```

`state.rootForm` is the live native `FieldTree`, so `rootForm.title().value()` and
the field's validation are entirely native — a fact the page and the stepper lean on.

## Tour

A real CMS editor screen is more than one form. It is a *page*: a few forms side by
side, a dynamic component or two (a publish-status banner, a live preview), and blocks
that appear only when relevant — arranged in a layout. You author a page with the
builder. `createPage` hands you a callback where you `addForm` (by name, from a typed
pool), `addComponent`, `insertRow`, and gate any node with `visibleWhen`. Visibility
is *data*: the renderer auto-`@if`s on it, so you never write the `@if`. The same
builder scales to many steps — here we use a single one.

```ts
import { signal } from '@angular/core';
import { StepperBuilder, asStepper, StepperComponent } from 'ngx-formad';

const status = signal<'draft' | 'scheduled'>('draft');

const editorPage = new StepperBuilder()
  .createForm('article', articleForm) // the form from above, in a typed pool
  .createForm('seo', seoForm) // title + meta description, another FormConfig
  .createStep((step) =>
    step.createPage({ options: { heading: 'Edit article' } }, (page) =>
      page
        .addForm((f) => f.article) // place the article form by name
        .insertRow('cols-2', (row) => row.addForm((f) => f.seo)) // a layout row
        .addComponent(ScheduleNotice, {
          inputs: { when: () => status() },
          visibleWhen: () => status() === 'scheduled', // conditional, as data
        }),
    ),
  )
  .build();

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="page" />`,
})
export class EditorScreen {
  readonly page = asStepper(editorPage);
}
```

That is one screen composed from configuration: the Article and SEO forms render the
way the form section described, the row arranges SEO into its own group, and
`ScheduleNotice` exists in the DOM **only while `status()` is `'scheduled'`** — the
renderer added and removed it for you. Flip the signal back to `'draft'` and the
component is gone, with no `@if` anywhere in your code.

## The stepper

Publishing an article is a sequence: Basics → SEO → Review. A *stepper* turns the
pages above into ordered steps and adds the three things a wizard needs: navigation,
a completion gate (you cannot advance past an invalid step — it is folded from the
native `valid()` of every field), and cross-step shared state with **directional
autofill**, where a value entered early flows forward into a later field and is never
clobbered once the user edits it. It is the same builder, with more steps plus
`withState` and `bind`.

```ts
const wizard = new StepperBuilder()
  .withState({ slug: '' }) // declares the cross-step shared state
  .createForm('article', articleForm)
  .createForm('seo', seoForm)
  .createStep((step) =>
    step.createPage({ options: { heading: 'Basics' } }, (page) =>
      page.addForm((f) => f.article, {
        bind: (l) => l.link((m) => m.slug, (s) => s.slug), // article.slug → shared.slug
      }),
    ),
  )
  .createStep((step) =>
    step.createPage({ options: { heading: 'SEO' } }, (page) =>
      page.addForm((f) => f.seo, {
        bind: (l) => l.link((m) => m.slug, (s) => s.slug), // shared.slug → seo.slug (prefill)
      }),
    ),
  )
  .build();

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
export class PublishWizard {
  readonly stepper = asStepper(wizard);
}
```

At runtime the shell shows **Basics** with its heading and a Next button that stays
disabled until the step is valid — that is the completion gate. Type a slug and
advance, and **SEO opens with its slug already filled in**, because both fields
`link` the same shared key and the value flowed forward. Edit it on SEO, go Back, come
Forward again, and your edit stays: the prefill only writes into a *pristine* field,
so it never overwrites what a user typed.

That safety is by design. A two-way binding between steps would oscillate; this sync
is directional and discrete, with only two edges — **shared → field** on entry (only
while pristine), and **field → shared** on commit (Next / Back), once. The pristine
gate reads the native `dirty()` flag, and the seed writes through the field's value
signal, which
[per the field-state docs](https://angular.dev/guide/forms/signals/field-state-management)
does not mark a field dirty — so a seed never trips its own gate, and nothing can loop.

That is the whole arc: a **form** renders one content type, a **page** composes
forms and components into a screen, a **stepper** sequences pages into a wizard with
shared state. The rest of this document is the reference.

---

# Reference

## Validation

ngx-formad does not re-invent validation. You attach a standard signal-forms
`schema`; the native field tree validates, and the default control prints the message
inline once the field is touched.

```ts
import { email, minLength, required } from '@angular/forms/signals';

const seoForm: FormConfig<Seo> = {
  model: () => ({ slug: '', metaDescription: '' }),
  ui: /* …formodel ui… */,
  schema: (p) => {
    required(p.slug, { message: 'A slug is required to publish.' });
    minLength(p.metaDescription, 50, { message: 'Aim for 50+ characters for SEO.' });
  },
};
```

After blurring an empty slug, the default control emits:

```html
<label class="ngx-formad-field">
  <span>Slug</span>
  <input type="text">
  <small class="ngx-formad-error">A slug is required to publish.</small>
</label>
```

Because errors live on the native field tree, you can also read them yourself —
`state.rootForm.slug().errors()`, `.valid()`, `.touched()` — which is exactly how the
[live examples](#live-examples) build a validation summary and gate the Next button.

## Theming with adapters

Rendering splits into **two orthogonal axes**, each a single object you swap once
through the provider. The renderer never changes; you change the adapter.

- **Control adapter** — maps a field's *kind* (`'text'`, `'select'`, …) to a native
  `FormValueControl` component. *How one field looks.*
- **Layout adapter** — maps a *layout spec* to classes/styles on the container and
  each item. *How a cluster of fields is arranged.*

Both ship a zero-dependency default (plain HTML controls, inline CSS grid). Override
one, the other, or both — a Material control adapter sits happily inside a Tailwind
layout, because the axes are orthogonal:

```ts
import { provideStepperSuite } from 'ngx-formad';

bootstrapApplication(App, {
  providers: [
    provideStepperSuite({
      controls: myControls, // optional — omit to keep plain-HTML controls
      layout: tailwindLayout, // optional — omit to keep the CSS-grid layout
    }),
  ],
});
```

### Writing a control adapter

A control is any component implementing Angular's native `FormValueControl<T>`. The
renderer instantiates it and attaches the native `FormField` directive, so **value,
errors, touched, dirty, disabled and required all sync from the field tree
automatically** — you only render them. Presentational extras (label, placeholder,
input `type`, select `options`, textarea `rows`) arrive as plain inputs from the node.

```ts
import { Component, input, model } from '@angular/core';
import { FormValueControl, ValidationError } from '@angular/forms/signals';

@Component({
  selector: 'app-text',
  template: `
    <label class="my-field">
      <span>{{ label() }}</span>
      <input
        [type]="type()"
        [value]="value()"
        [placeholder]="placeholder()"
        [disabled]="disabled()"
        (input)="value.set($any($event.target).value)"
        (blur)="touched.set(true)"
      />
      @if (touched() && errors().length) {
        <small class="my-error">{{ errors()[0]?.message }}</small>
      }
    </label>
  `,
})
export class AppText implements FormValueControl<string> {
  value = model(''); // the contract: a two-way value the FormField directive binds
  touched = model(false); // field state mirrored in from the tree — you read it
  disabled = input(false);
  required = input(false);
  errors = input<readonly ValidationError.WithOptionalFieldTree[]>([]);
  label = input(''); // presentational inputs fed from the node, per kind
  placeholder = input('');
  type = input<'text' | 'email' | 'password' | 'tel' | 'url'>('text');
}
```

The adapter is a registry from kind to component:

```ts
import { ControlAdapter } from 'ngx-formad';

export const myControls: ControlAdapter = {
  controlFor: (kind) => {
    switch (kind) {
      case 'text':
      case 'email':
      case 'password':
      case 'tel':
      case 'url':
        return AppText; // the node's `type` input picks the native input type
      case 'textarea':
        return AppTextarea;
      case 'number':
        return AppNumber;
      case 'select':
      case 'radio':
        return AppSelect; // node feeds `options: { value, label }[]`
      case 'checkbox':
        return AppCheckbox;
      default:
        return null; // unknown kind → renderer falls back to its text control
    }
  },
};
```

Returning `null` instead of throwing is the contract: a typo degrades to a text
input, and a kind only *your* adapter knows (`'date'`, `'file'`) coexists with the
defaults. The defaults handle `text`, `email`, `password`, `tel`, `url`, `textarea`,
`number`, `select`, `radio`, `checkbox`.

### Writing a layout adapter

A layout adapter turns a declarative spec into a `class` string, a `style` map, or
both — for the **container** and for each **item**. It never sees a field's kind;
that is the control axis.

```ts
import { LayoutAdapter } from 'ngx-formad';

export const tailwindLayout: LayoutAdapter = {
  container: ({ cols = 1, gap = 4 }) => ({ class: `grid grid-cols-${cols} gap-${gap}` }),
  item: ({ colSpan }) => (colSpan ? { class: `col-span-${colSpan}` } : {}),
};
```

The three types: `LayoutSpec` = `{ cols?: number; gap?: number }` (`gap` in 0.25rem
steps, Tailwind's scale); `ItemSpec` = `{ colSpan?: number }` (per field, via
`FieldConfig.layout`); both methods return `LayoutClasses` = `{ class?: string;
style?: Record<string, string> }`. So one spec resolves differently per adapter —
your form config never changes:

| Adapter | What the container element gets |
| --- | --- |
| default (`cssLayout`) | `style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem"` |
| `tailwindLayout` (above) | `class="grid grid-cols-2 gap-4"` |

> **Tailwind gotcha:** classes built by interpolation (`grid-cols-${cols}`) must be
> discoverable by Tailwind's compiler — safelist them, or map specs to static names.

## API

Everything is exported from the package root (`ngx-formad`).

### Render a single form

| Symbol | What it is |
| --- | --- |
| `FormConfig<M>` | A form as data: `{ model: () => M; ui: UiFormGroupConfig<M>; schema?: SchemaOrSchemaFn<M> }`. |
| `instantiateForm(config)` | Turns a `FormConfig` into live `FormState` (calls native `form()`; needs an injection context). |
| `FormState<M>` | `{ model: WritableSignal<M>; rootForm: FieldTree<M>; fields: FieldConfig[] }`. |
| `asRenderable(state)` | The single, named widening from `FormState<M>` to the erased view the renderer consumes. |
| `FormRenderer` | The `<ngx-formad-form [state] [layout] />` component. Pure view — no `form()` call. |

### Author a multi-step wizard

| Symbol | What it is |
| --- | --- |
| `StepperBuilder` | The fluent chain. Each method narrows the type (see below). |
| `Stepper<TForms, TShared>` | The built wizard: `{ forms, steps, shared }`. |
| `asStepper(stepper)` | The single, named widening from a typed `Stepper` to `RuntimeStepper`. |
| `RuntimeStepper` | `Stepper` with pool/shared types erased — what the runtime and shell consume. |
| `SharedLink<M, S>` | The `bind` recorder: `.link(m => m.field, s => s.key)` ties a model field to a shared key. |
| `StepperComponent` | The bundled `<ngx-formad-stepper [stepper] />` shell — navigation, progress, sync edges. |

### Run it yourself (bring-your-own-UI)

| Symbol | What it is |
| --- | --- |
| `materializeStep(step, pool, shared, inj)` | Instantiates a step's forms, registers them, wires the sync. Returns a `LiveStep`. |
| `LiveStep` / `LiveForm` | `LiveStep = { registry, forms }`; `LiveForm = { name, state, seed(), commit() }`. |
| `InstanceRegistry` | Collects a step's live forms; `completed()` folds `valid()` over the visible ones. |
| `SharedState<S>` | The plain-signal cross-step store; `get(key)`, `patch(partial)`, `select(key)`, `slot(key)`. |

### Configure the look (call once)

| Symbol | What it is |
| --- | --- |
| `provideStepperSuite(opts?)` | Registers the adapters. No args = zero-dependency defaults (plain HTML + CSS grid). |
| `ControlAdapter` / `LayoutAdapter` | The two pluggable axes; `defaultControls` and `cssLayout` are the shipped defaults. |

### The builder, method by method

Each method moves the type forward — the form pool and shared-state shape are tracked
in `StepperBuilder`'s two generics, so `addForm`/`bind` are checked against the exact
forms and keys you declared. Read each comment as the inferred type *after* the call:

```ts
new StepperBuilder()
//  StepperBuilder<{}, {}>                                           empty pool, empty shared state
  .withState({ slug: '' })
//  StepperBuilder<{}, { slug: string }>                             declares shared state; narrows TShared
  .createForm('article', articleForm)
//  StepperBuilder<{ article: FormConfig<Article> }, { slug: string }>   registers a form; narrows TForms
  .createForm('seo', seoForm)
//  StepperBuilder<{ article: …; seo: FormConfig<Seo> }, { slug: string }>
  .createStep((step) => /* … */)
//  StepperBuilder<…unchanged…>   createStep returns `this`; steps are data, the callbacks *read* the types
  .build();
//  Stepper<{ article: FormConfig<Article>; seo: FormConfig<Seo> }, { slug: string }>
```

So `build()` produces a `Stepper` whose shape is everything the chain accumulated:

```ts
class Stepper<TForms, TShared> {
  readonly forms: TForms; //  the typed pool, keyed by name: { article: FormConfig<Article>; seo: … }
  readonly steps: readonly StepNode[]; //  the plain step/page/node tree the renderer walks
  readonly shared: SharedState<TShared>; //  the live cross-step store, typed { slug: string }
}
```

Then `asStepper(stepper)` erases the two generics to `RuntimeStepper` for the shell,
or you walk `steps`/`forms`/`shared` yourself with `materializeStep` — the
bring-your-own-UI path. The inner callbacks have small, fixed shapes:

```ts
createStep((step) => …)                       // step: StepBuilder<TForms, TShared>
step.createPage({ options: PageOptions }, (page) => …)    // page: PageBuilder<…>
page.addForm((f) => f.name, {                 // f: FieldRefs<TForms> — declared forms only
  submitLabel?: string,
  visibleWhen?: () => boolean,                // auto-@if'd by the renderer
  bind?: (l: SharedLink<Model, Shared>) => void,   // m = selected form's model, s = shared shape
})
page.addComponent(Component, { inputs, outputs, visibleWhen?, layout? })  // typed to the component
page.addContent({ layout? })                  // a bare layout slot
page.insertRow('grid-cols-2', (row) => …)     // a nested PageBuilder
```

## Live examples

A runnable showcase ships under `projects/examples` — a storefront self-service
portal with three multi-step flows (Return, Complaint, Warranty) built on every
concept above. From the workspace root:

```bash
pnpm examples   # builds the library, then serves the example app
```

It demonstrates, end to end: **config-only forms**, a **bring-your-own-UI shell**
built on `materializeStep` and the instance registry rather than `StepperComponent`,
**directional autofill** (a tax ID typed on step 1 arrives prefilled six steps later,
with a "we pre-filled this" banner), and **validation surfaced two ways** — inline on
blur, plus a summary that lists every offending field when you press Continue on an
invalid step, with navigation gated on the completion fold.

## FAQ

**What problem does ngx-formad solve?** Angular signal forms are headless — they own
value and validation but render nothing. ngx-formad renders forms from configuration
and orchestrates multi-step wizards, so you stop hand-writing a template per form.

**Does it replace Angular signal forms?** No. It renders *on top of* them. Your
`schema`, `FieldTree`, and `FieldState` are the real native ones.

**Which Angular versions are supported?** Angular **21.2+ and 22**, from one package.

**Can I use Material, PrimeNG, or Tailwind?** Yes — write a control adapter and/or a
layout adapter. The two axes are independent.

**Do I need to write templates?** No. Fields, layout, visibility, and dynamic
components are config; the renderer produces the DOM, including the `@if` on visibility.

**Can I bring my own wizard UI?** Yes. `materializeStep` + the instance registry give
you the runtime primitives; the bundled `StepperComponent` is one shell built on them,
and the live example ships another.

## License

MIT
