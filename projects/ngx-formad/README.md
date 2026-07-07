# ngx-formad — config-driven forms and multi-step wizards for Angular signal forms

ngx-formad renders Angular forms from configuration. You describe a form — or a
multi-step wizard — as data, and one renderer walks that data and produces the DOM.
Field appearance (Material, plain HTML, or your own) and layout (CSS grid, Tailwind,
or your own) are adapters you configure once. It sits on top of Angular's headless
[signal forms](https://angular.dev/guide/forms/signals), which own value and
validation but render nothing, and supplies the rendering and multi-step orchestration.

- **Render from config** — fields, layout, visibility, and dynamic components as data.
- **Multi-step wizards** — navigation, a completion gate, and cross-step prefill.
- **Pluggable adapters** — swap controls and layout independently; the defaults need no extra dependencies.
- **Native validation** — your `schema` runs on the real `FieldTree`; ngx-formad adds no validation layer of its own.
- **One peer dependency** — [`formodel`](https://www.npmjs.com/package/formodel), the typed form description it renders.

> **Status — early release.** This is `0.1.x` and built on the signal-forms API that
> is *experimental* in Angular 21. Both the API underneath and this library's own
> surface may change in breaking ways before a 1.0. It has unit tests but no
> significant production track record yet; evaluate it on a small form first.

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

It is built for teams that render many forms from configuration rather than
hand-writing each one: CMS and admin panels with user-defined content types,
low-code/no-code builders, onboarding and checkout wizards, and survey engines.

## When should I use it?

**Use ngx-formad if** your forms are numerous, structurally similar, conditional,
JSON/config-driven, or multi-step — because content types, product configurators,
or admin screens multiply faster than you can hand-write templates.

**Skip it if** you are building one bespoke form. Native signal forms plus a
hand-written template will be smaller and clearer, and this adds nothing.

### What it gives you

- **Config-driven rendering** — fields, nested groups, and repeating arrays drawn from a `FormConfig`, with no per-field template.
- **Pluggable adapters** — control and layout axes you swap independently; a ready-made Angular Material control adapter ships in the box.
- **Multi-step wizards** — navigation with a completion gate folded from each field's native `valid()`.
- **Flows that bend to the data** — conditional, optional, lazy, and deferred steps; branching that rejoins, and forking that returns a typed result.
- **Cross-step shared state** — directional prefill that seeds a later field and leaves a user's edit untouched.
- **Native validation, unchanged** — your `schema` runs on the real `FieldTree`; nothing is re-implemented.
- **Headless core** — drive the `StepperController` directly for a fully custom wizard UI.

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

### Custom layout: place fields and components in a responsive grid

By default a form renders its fields in declared order. To arrange them — put two
fields side by side, drop a component *between* fields, group a cluster into its own
sub-grid — add a **layout overlay** to the `FormConfig`. Field-building in `ui` is
untouched; the overlay only decides order, grid placement, and where components sit.
Build it with `formLayout(...)`:

```ts
import { formLayout, FormConfig } from 'ngx-formad';
import { PasswordChecklist } from './password-checklist';

type Signup = { first: string; last: string; password: string; repeat: string };

const signupForm: FormConfig<Signup> = {
  model: () => ({ first: '', last: '', password: '', repeat: '' }),
  ui: UiFormConfigBuilder.from({ first: '', last: '', password: '', repeat: '' })
    .first(text('First name'))
    .last(text('Last name'))
    .password(password('Password'))
    .repeat(password('Repeat password')),
  layout: formLayout<Signup>()
    .cols({ base: 1, md: 2 }) // one column on mobile, two from `md` up
    .field('first', { colSpan: { md: 1 } })
    .field('last', { colSpan: { md: 1 } }) // first | last, side by side ≥ md
    .field('password', { colSpan: { base: 1, md: 2 } })
    .field('repeat', { colSpan: { base: 1, md: 2 } })
    // A component, its inputs bound to the LIVE form — updates as you type.
    .component(PasswordChecklist, {
      colSpan: { base: 1, md: 2 },
      inputs: { value: (ctx) => ctx.model.password },
    })
    .build(),
};
```

A component's inputs (and `visibleWhen`) are functions of a **context** — the live
model value, the field tree (per-field `errors()`/`touched()`, not just values), and,
when the form runs inside a stepper page, the cross-step `shared` store (`null`
standalone):

```ts
.component(SummaryCard, {
  inputs: {
    name: (ctx) => ctx.model.first,
    invalid: (ctx) => ctx.form.password().invalid(),
    plan: (ctx) => ctx.shared?.get('plan'),
  },
  visibleWhen: (ctx) => ctx.model.password.length > 0,
})
```

Group a cluster into its own sub-grid with `.row(grid, build)`:

```ts
.row({ cols: 3 }, (row) => row.field('city').field('postCode').field('country'))
```

Fields left out of the overlay still validate (they are in the schema) but do not
render — list every field you want shown.

**Responsive layout needs the class adapter + stylesheet.** `colSpan`/`cols` accept a
constant (`2`) or a per-breakpoint map (`{ base: 1, md: 2 }`). The zero-dependency
default (`cssLayout`) resolves only the `base` value (inline styles can't carry media
queries). For real responsive layouts, register `classLayout` (it emits class names)
and generate the backing CSS for **your** breakpoints from the shipped stylesheet:

```scss
// styles.scss — pass your own breakpoints; we generate the utilities.
@use 'ngx-formad/styles' as formad;
@include formad.grid((sm: 40rem, md: 48rem, lg: 64rem, xl: 80rem));
```

```ts
import { classLayout, provideFormadSuite } from 'ngx-formad';

provideFormadSuite({ layout: classLayout /* , controls, stepper */ });
```

Breakpoints are yours to name and size; they are emitted mobile-first, so a value set
at one breakpoint waterfalls to every wider one until overridden.

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

### …and the flow can bend to the data

A real publishing wizard isn't a straight line. The same chain bends to the input,
and none of it is imperative — it's all data the engine reads at each navigation
boundary:

- **Nested models** render as nested fieldsets — an Article with an `seo: { title,
  metaDescription }` object becomes an SEO group with no extra work. See
  [Nested groups](#nested-groups).
- **A step can be conditional or optional** — `createStep(build, { when })` drops a
  step that doesn't apply; `{ optional: true }` lets the user skip it.
- **The end can fork.** Publishing splits — *publish now* vs *schedule* — into two
  short arms with **different results**:

```ts
  .fork((ctx) => ctx.shared.mode, {
    now:      (arm) => arm.createStep(/* confirm */)
                          .result(() => ({ kind: 'published' as const })),
    schedule: (arm) => arm.withState({ at: '' }).createForm('when', whenForm)
                          .createStep(/* pick date */)
                          .result(({ shared }) => ({ kind: 'scheduled' as const, at: shared.at })),
  })
  .build(); // → Stepper<…, { kind:'published' } | { kind:'scheduled'; at:string }>
```

So the arc scales: a **form** renders one content type (nested or flat), a **page**
composes forms and components into a screen, a **stepper** sequences pages — gating,
branching, and forking on the data — into a wizard that returns a typed result. The
rest of this document is the reference.

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

## Nested groups

A model with nested objects renders as **nested fieldsets** — you don't flatten it by
hand. formodel describes an object key as a group (`{ label, maxCols, controlsConfig }`)
and the renderer descends into it; `form(model)` already nests the `FieldTree`
(`root.address.city`) and folds validity over the whole tree, so nothing else changes.

```ts
type Account = { name: string; address: { city: string; street: string; zip: string } };

const accountForm: FormConfig<Account> = {
  model: () => ({ name: '', address: { city: '', street: '', zip: '' } }),
  ui: UiFormConfigBuilder.from({ name: '', address: { city: '', street: '', zip: '' } })
    .name(text('Name'))
    .address({ label: 'Address', maxCols: 2 }, (b) =>
      b.city(text('City')).street(text('Street')).zip(text('ZIP')),
    ),
  schema: (p) => {
    required(p.name);
    required(p.address.city); // validate nested paths natively
  },
};
```

That renders `Name`, then an **Address** fieldset with City/Street/ZIP in a 2-column
grid. Groups nest arbitrarily deep. Each leaf in `state.fields` carries its full
`path` (`['address','city']`), so a custom chrome's validation summary can address
nested fields, and the completion gate already counts them. **`bind` reaches nested
fields too** — `bind: (l) => l.link((m) => m.address.city, (s) => s.city)` links a
nested field to a shared key, so cross-step prefill works at any depth.

### Repeating arrays

A model array (`T[]`) is a **repeating group**: formodel describes it with `array(itemConfig)`,
and the renderer draws each item from `itemConfig`, with Add/Remove controls.

```ts
type Order = { items: { sku: string; qty: number }[] };

const orderForm: FormConfig<Order> = {
  model: () => ({ items: [] }),
  ui: UiFormConfigBuilder.from({ items: [] as { sku: string; qty: number }[] }).items(
    array(UiFormConfigBuilder.from({ sku: '', qty: 1 }).sku(text('SKU')).qty(number('Qty')), {
      label: 'Line items',
      addLabel: 'Add item',
    }),
  ),
};
```

Each item renders the `itemConfig` (nested groups included), bound to that item's
field tree; **Add** appends a blank item and **Remove** drops one, both immutable
updates of the array field's value signal so validity re-folds automatically. The
`addable`/`removable`/`addLabel`/`removeLabel` flags from the node control the
affordances.

## Conditional, optional & lazy steps

Real wizards branch. `createStep` takes options — `when`, `optional`, `defer` —
that make a step conditional, skippable, or deferred, all as data. Two paths
(say an admin vs. a regular account) are expressed by gating their steps on a
condition; the common steps that follow are ungated, so **the branches rejoin
automatically**. Because both branches `bind` to the same shared keys, everything
downstream is branch-agnostic — the shared state *is* the converging interface.

```ts
new StepperBuilder()
  .withState({ accountType: 'user' as 'user' | 'admin' })
  .createForm('basics', basicsForm)
  .createForm('adminConfig', () => import('./admin').then((m) => m.adminConfigForm)) // lazy
  .createForm('userMeta', userMetaForm)
  .createForm('review', reviewForm)
  .createStep((s) => s.createPage(/* Basics */))
  .createStep((s) => s.createPage(/* Advanced */), {
    when: ({ value }) => value('basics')?.accountType === 'admin', // (a) a prior step's value
    defer: 'idle', // render this heavy step inside @defer
  })
  .createStep((s) => s.createPage(/* Settings */), {
    when: ({ shared }) => shared.accountType !== 'admin', // (b) shared state
  })
  .createStep((s) => s.createPage(/* Notes */), { optional: true }) // shows a Skip button
  .createStep((s) => s.createPage(/* Review */)) // ungated — admin & user paths rejoin here
  .build();
```

- **`when(ctx)`** is typed against the wizard you're building — `ctx.shared` is your
  `withState` shape, and `ctx.value('basics')` is that form's **last-committed**
  model (both autocomplete; unknown keys are compile errors). It reads from three
  sources: **(a)** a previous step's form value via `value()`, **(b)** the cross-step
  `shared` state, and **(c)** anything you close over — ignore the arg and read an
  external signal. It is reactive: flip the value and the step appears or disappears,
  and the sequence re-shapes live.
- **`optional: true`** makes the step skippable — the bundled shell renders a **Skip**
  that advances past the completion gate.
- **`completeWhen: () => boolean`** is an extra gate ANDed with the form fold. A step
  whose body is a dynamic component rather than a form (a selection grid, a custom
  picker) contributes no fields to the fold, so it is otherwise *vacuously complete*
  and Next is always enabled; `completeWhen` lets it gate Next on its own state — e.g.
  `{ completeWhen: () => picked().length > 0 }`. It is reactive.
- **Lazy forms** — pass `createForm(name, () => Promise<FormConfig>)` and the config is
  fetched only when its step is reached (eager steps stay synchronous). The pool type
  still records `FormConfig<M>`, so `addForm`/`bind`/`value` are unchanged.
- **`defer`** renders the step's body inside an Angular `@defer` block (`'idle' |
  'viewport' | 'interaction'`) with a placeholder while it hydrates.

The built `Stepper` is the source of truth for these types: `StepContextFor<S>`
derives the `when` context from a stepper `S`, so a bring-your-own-UI host gets the
same typing. Hosts compose the same primitives the shell uses — `effectiveSteps(steps, ctx)`
(the conditional filter), `resolveStepForms` (await lazy configs), and `stepFormNames`
— and drive their own `@defer` with any trigger.

### Branching

Gating every step of a path with the same `when` is tedious, so `branch` groups
them: a selector picks a branch by key, and each branch authors its own steps. It
is **pure sugar** — every branch step compiles to a `when`-gated step, so the
runtime is unchanged and **branches rejoin automatically** at the next ungated step.

```ts
new StepperBuilder()
  .withState({ plan: 'free' as 'free' | 'pro' })
  .createForm('start', startForm)
  .createForm('billing', billingForm)
  .createForm('seats', seatsForm)
  .createForm('done', doneForm)
  .createStep((s) => s.createPage(/* Start */))
  .branch((ctx) => ctx.shared.plan, {
    //        ▲ ctx is the same typed context as `when`: read shared or value(...)
    pro: (b) =>
      b
        .step((s) => s.createPage(/* Billing */))
        .step((s) => s.createPage(/* Seats */), { when: ({ shared }) => shared.plan === 'pro' }),
    free: (b) => b.step((s) => s.createPage(/* Free note */)),
  })
  .createStep((s) => s.createPage(/* Done */)) // ungated — both branches rejoin here
  .build();
```

The selector is typed against the wizard (`ctx.shared.plan` autocompletes). Branches
**nest** (`b.branch(...)`), and a step's own `when` is ANDed with the branch guard.
Because branching reduces to conditions, the `value(...)` source works too: branch on
a previous step's submitted answer, not just on shared.

### Forking

Branch and fork are different intents:

| | **branch** | **fork** |
| --- | --- | --- |
| Idea | Same destination, different road | Different destinations |
| Rejoin | Yes — common steps follow | No — each arm is terminal |
| Result | Unchanged | A **discriminated union**, one variant per arm |
| State | One shape | Parent **+ each arm's own local slice** |
| Returns | `this` (keep chaining) | A terminal — only `build()` |

Use **fork** when the input picks *what the wizard becomes* and each path produces a
**different result**. Each arm declares its own state, forms, steps, and a typed
`result`; `fork` unions the arms' results into the wizard's result type and returns a
terminal, so nothing can follow it.

```ts
const wizard = new StepperBuilder()
  .withState({ kind: '' as '' | 'individual' | 'business' })
  .createForm('start', kindForm)
  .createStep((s) => s.createPage(/* choose kind */))
  .fork((ctx) => ctx.shared.kind, {
    individual: (arm) =>
      arm
        .withState({ ssn: '' })                     // arm-local state
        .createForm('person', personForm)
        .createStep((s) => s.createPage(/* personal */))
        .result(({ shared }) => ({ kind: 'individual' as const, ssn: shared.ssn })),
    business: (arm) =>
      arm
        .withState({ vat: '' })
        .createForm('company', companyForm)
        .createStep((s) => s.createPage(/* company */))
        .createStep((s) => s.createPage(/* seats */))
        .result(({ shared }) => ({ kind: 'business' as const, vat: shared.vat })),
  })
  .build();
// build() → Stepper<…, { kind:'individual'; ssn:string } | { kind:'business'; vat:string }>
```

Each arm's `result(...)` type is inferred independently and unioned into the
stepper's `TResult`. The shell surfaces it on finish:

```ts
<ngx-formad-stepper [stepper]="stepper" (completed)="onResult($event)" />
// onResult(r) → narrow by r.kind. (Erased to `unknown` at the output; a custom
// chrome reads the typed controller.result() directly.)
```

A selector value with no matching arm (e.g. the initial `''`) simply means "no arm
chosen yet" — no arm steps, `result()` is `null`. Because the decision is committed
before navigation advances, choosing an arm on a step and pressing Continue moves
straight into it.

## Theming with adapters

Rendering splits into **three orthogonal axes**, each swapped once through the
provider. Nothing else changes; you change the adapter.

- **Control adapter** — maps a field's *kind* (`'text'`, `'select'`, …) to a native
  `FormValueControl` component. *How one field looks.*
- **Layout adapter** — maps a *layout spec* to classes/styles on the container and
  each item. *How a cluster of fields is arranged.*
- **Stepper chrome** — a component that draws the wizard shell (nav, progress,
  headings) around the headless `StepperController`. *How the wizard looks.*

Controls and layout ship zero-dependency defaults (plain HTML, inline CSS grid);
the stepper falls back to a bundled chrome. Override one, several, or none — a
Material control adapter sits happily inside a Tailwind layout under a custom
chrome, because the axes are orthogonal:

```ts
import { provideFormadSuite } from 'ngx-formad';

bootstrapApplication(App, {
  providers: [
    provideFormadSuite({
      controls: myControls, // optional — omit to keep plain-HTML controls
      layout: tailwindLayout, // optional — omit to keep the CSS-grid layout
      stepper: MyStepperChrome, // optional — omit to keep the bundled chrome
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
input, and a kind only *your* adapter knows coexists with the defaults. The defaults
handle `text`, `email`, `password`, `tel`, `url`, `textarea`, `number`, `select`,
`radio`, `checkbox`, `date`, and `file`. The `checkbox` control also takes an
`innerHTML` input (from the node) for a rich label — a consent line with links, say.

> **Reserved input names.** `value`, `touched`, `errors`, `disabled`, `required`,
> and the validation-metadata names `min`, `max`, `minLength`, `maxLength`,
> `pattern`, `step` belong to the native `FormValueControl` contract (and are typed
> — `min`/`max` are `number`). A presentational input must not reuse them, which is
> why the bundled `date` control names its bounds `minDate`/`maxDate`.

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

### Angular Material

A ready-made Material control adapter ships as a secondary entry point —
**`ngx-formad/material`** — so you don't write one. It's part of the `ngx-formad`
package (no separate install, no version skew), with `@angular/material` and
`@angular/cdk` as *optional* peer dependencies pulled in only when you import it.

```bash
pnpm add @angular/material @angular/cdk   # if you don't already have them
```

```ts
import { provideFormadSuite } from 'ngx-formad';
import { materialControls } from 'ngx-formad/material';

bootstrapApplication(App, {
  providers: [provideFormadSuite({ controls: materialControls })],
});
```

Every form then renders with `mat-form-field` / `mat-select` / `mat-checkbox` /
`mat-datepicker` (and a Material file picker), no change to any form config. It
implements the same `ControlAdapter` contract as the default, mapping the same kinds
(including `date` and `file`); errors bridge to Material's `<mat-error>` via a
per-control `ErrorStateMatcher` reading the field's touched/errors signals. The
`date` control needs a `DateAdapter` in the app (`provideNativeDateAdapter()` or a
Moment/Luxon adapter), as any Material datepicker does. Swapping the layout or
stepper-chrome axis is independent, as always.

`mat-form-field` is `inline-block`, so a field renders at its content width rather
than filling its grid column. The adapter ships a small stylesheet for this —
`@use` it once from your global styles (it's plain CSS you can override, not a theme):

```scss
@use 'ngx-formad/material/styles';
```

### Writing a stepper chrome

The wizard shell is split in two: a headless **`StepperController`** owns all the
orchestration (the effective sequence, navigation, the completion gate, the
directional sync, lazy and deferred building), and a **chrome** component draws the
look around it. To restyle the wizard you write a chrome — a component whose only
input is the controller — and register it; you never reimplement the engine.

```ts
import { Component, input } from '@angular/core';
import { StepPageView, StepperController } from 'ngx-formad';

@Component({
  selector: 'app-chrome',
  imports: [StepPageView],
  template: `
    <header>{{ c().heading() }} — step {{ c().index() + 1 }} of {{ c().total() }}</header>

    @if (c().loading()) {
      <div class="skeleton"></div>
    } @else if (c().step(); as step) {
      <ngx-formad-step-page [step]="step" /> <!-- renders the step's whole page -->
    }

    <footer>
      <button [disabled]="!c().canBack()" (click)="c().back()">Back</button>
      @if (c().optional()) {
        <button (click)="c().skip()">Skip</button>
      }
      <button [disabled]="!c().canNext()" (click)="c().next()">
        {{ c().isLast() ? 'Finish' : 'Next' }}
      </button>
    </footer>
  `,
})
export class AppChrome {
  readonly controller = input.required<StepperController>();
  protected readonly c = this.controller;
}
```

```ts
provideFormadSuite({ stepper: AppChrome });
```

`StepperController` exposes signals — `step`, `loading`, `index`, `total`,
`heading`, `subheading`, `canBack`, `canNext`, `isLast`, `optional`, `deferTrigger`,
`result`, and `committed` (every form's last-committed model, the data-egress for
persisting as you go) — and the actions `next()`, `back()`, `skip()`, and `reset()`
(restart: clears committed values, resets shared state, re-enters the first step).
`StepPageView` (`ngx-formad-step-page`) renders a step's **whole page** — forms,
dynamic components, rows, and content slots; wrap it in your own `@defer` to honour
`deferTrigger()`. (`StepFormsView` / `ngx-formad-step-forms` is the forms-only
subset, for a chrome that never uses `addComponent`.) The controller is also
exported, so a fully bespoke host can construct and drive it directly without the
token.

### Performance

A few properties keep the orchestrator off the critical path of typing and clicking:

- **Nothing is built ahead of time.** `build()` is data-only; the controller
  materializes only the *current* step, caches it by node identity, and re-seeds
  (never rebuilds) on revisit. Later steps don't exist until reached — proven by a
  test that counts model-factory calls.
- **Typing never wakes the orchestrator.** Conditions evaluate at navigation
  boundaries (bound values commit on move; `value()` is the last commit), and the
  field list is static, so a keystroke touches only the focused field's native
  validity — not the sequence, not the other fields.
- **Navigation never blocks the click.** Moving to a step only flips the target and
  shows a one-frame placeholder; the (possibly heavy) form build runs in the next
  `afterNextRender`, off the event's critical path. Cached steps are instant.
- **Heavy steps stay off the critical path** via lazy form configs (`createForm(name,
  () => import(...))`) and per-step `defer`.

Pair `provideFormadSuite()` with `provideZonelessChangeDetection()` — signal forms
are zoneless, and the whole suite is signal-driven, so change detection stays
fine-grained.

## Custom control kinds

The built-in kinds (`text`, `select`, `date`, `file`, …) cover ordinary fields. When
a field is a *widget* — a product picker, a company-lookup field, a colour swatch —
register it as a **custom control kind** and use it from config like any built-in. A
custom control is just a `FormValueControl<Value>` plus one typed `props` input; the
renderer hands it `props` and binds value/validity through the native `FormField`.

```ts
// 1 — the control: value + a typed props bag (a label, if it wants one, lives in props)
@Component({ selector: 'app-product-picker', template: `…` })
class ProductPicker implements FormValueControl<Product[]> {
  value = model<Product[]>([]);
  props = input.required<{ max?: number }>();   // ← the only extra input
}

// 2 — a typed helper from formodel, used like text()/select()
const productPicker = customInputType<Product[], { max?: number }>('productPicker');

// 3 — in a form config; the node only type-checks on a Product[] field
const basketForm: FormConfig<{ products: Product[] }> = {
  model: () => ({ products: [] }),
  ui: UiFormConfigBuilder.from({ products: [] as Product[] }).products(productPicker({ max: 5 })),
};
```

Register the kind in one of two places — the renderer resolves it **before** the
built-ins, so a custom kind can also override one:

```ts
// global, for every form in the app
provideFormadSuite({ controls: materialControls, controlTypes: { productPicker: ProductPicker } });

// or scoped to one wizard, fully typed — `add` rejects an existing kind, `override` requires one
new StepperBuilder()
  .addControlType('productPicker', ProductPicker) // ✅ new kind
  .overrideControlType('date', MyFancyDate)       // ✅ replaces the built-in date
  // .addControlType('text', X)                    // ❌ compile error: 'text' exists
```

`customInputType<Value, Props>` ties the node to its field by value type — a node
built for `Product[]` is a type error on a `string` field. A control with no config
needs no `props` (omit it; the renderer forwards nothing extra). The product step,
VAT-ID lookup, and similar widgets all become plain config fields this way.

## Conditional fields

Showing a field only when another has a value is **native** — no new vocabulary. Use
signal forms' `hidden()` in the schema; the renderer drops a hidden field from the
DOM (and it's already excluded from validity):

```ts
schema: (p) => {
  hidden(p.reseller, ({ valueOf }) => !valueOf(p.otherReseller)); // hide reseller until the box is ticked
}
```

Put build-time conditionals (role, a feature flag) in plain TS — a `FormConfig` is a
function. Reserve `hidden()`/`disabled()`/`readonly()` for what depends on what the
user *types*.

## Reading collected data from a slot — `FormadWizard`

A summary screen, or a widget that contributes to shared state, needs the wizard's
data without the host wiring inputs. `<ngx-formad-stepper>` provides a `FormadWizard`
for its subtree; inject it from any slot or custom control:

```ts
@Component({ selector: 'app-summary', template: `{{ data() | json }}` })
class Summary {
  private readonly wiz = inject(FormadWizard, { optional: true }); // null outside a stepper
  protected data = computed(() => this.wiz?.committed());           // every form's committed model
}
```

`FormadWizard` exposes `controller` (→ `committed()`, `step()`, `result()`, …) and
`shared` (`get`/`patch`/`snapshot`). Summaries stay free-form — you read the data and
render it however you like.

## Control-output effects — autofill from a widget

A control can emit *outputs* beyond its value (a VAT-ID field that resolves a company).
`addForm({ effects })` wires such an output to patch sibling fields — typed against
the control's payload and the form model:

```ts
page.addForm((f) => f.thirdParty, {
  effects: (e) =>
    e.on(
      (m) => m.taxId,          // the field whose control emits
      'resolved',              // the output name
      (company: Company, model) =>
        model.update((m) => ({ ...m, companyName: company.name, address: company.address })),
    ),
});
```

The handler runs a *programmatic* model write, which stays pristine — so it never
trips the seed-if-pristine gate of cross-step prefill. This is how the VAT-ID
autofill is config, not a bespoke component.

## API

Everything is exported from the package root (`ngx-formad`).

### Render a single form

| Symbol | What it is |
| --- | --- |
| `FormConfig<M>` | A form as data: `{ model: () => M; ui: UiFormGroupConfig<M>; schema?: SchemaOrSchemaFn<M> }`. |
| `instantiateForm(config)` | Turns a `FormConfig` into live `FormState` (calls native `form()`; needs an injection context). |
| `FormState<M>` | `{ model; rootForm: FieldTree<M>; nodes: RenderNode[]; fields: FieldConfig[] }` — `nodes` is the recursive render tree; `fields` are the flat leaves (each with `path`). |
| `RenderNode` | A render-tree node: `ControlNode` \| `GroupNode` (nested) \| `ArrayNode`. `buildNodes(ui)` builds it. |
| `asRenderable(state)` | The single, named widening from `FormState<M>` to the erased view the renderer consumes. |
| `FormRenderer` | The `<ngx-formad-form [state] [layout] />` component. Pure view — no `form()` call. |

### Author a multi-step wizard

| Symbol | What it is |
| --- | --- |
| `StepperBuilder` | The fluent chain. Each method narrows the type (see below); `fork(...)` terminates it. Also `addControlType`/`overrideControlType` register wizard-scoped custom control kinds (typed: add rejects an existing kind, override requires one). |
| `FormadWizard` | Injectable per stepper — `committed()` (every form's committed model), `controller`, `shared`. Inject it `{ optional: true }` from a slot or custom control to read the wizard's data. |
| `BranchBuilder` | Authors one branch's steps inside `branch(select, { … })`; `step()` and nested `branch()`. |
| `ForkArmBuilder` / `ForkArm` | Authors one fork arm (`withState`/`createForm`/`createStep`/`branch`) ending in `result(...)`. |
| `Stepper<TForms, TShared, TResult>` | The built wizard: `{ forms, steps, shared, resolveResult? }`. |
| `StepperResult<S>` | Extracts a stepper's discriminated result type (the union of its fork arms). |
| `asStepper(stepper)` | The single, named widening from a typed `Stepper` to `RuntimeStepper`. |
| `RuntimeStepper` | `Stepper` with pool/shared types erased — what the runtime and shell consume. |
| `SharedLink<M, S>` | The `bind` recorder: `.link(m => m.field, s => s.key)` ties a model field to a shared key. |
| `StepperComponent` | The `<ngx-formad-stepper [stepper] (completed) (stepCommitted) />` shell — builds the controller, renders the chrome, emits the fork result on finish, and emits every form's committed model on each navigation. |

### Run it yourself (bring-your-own-UI)

| Symbol | What it is |
| --- | --- |
| `StepperController` | The headless engine: state signals (`step`, `index`, `canNext`, `result`, `committed`, …) + `next`/`back`/`skip`/`reset`. |
| `StepPageView` | `<ngx-formad-step-page [step] />` — renders one step's **whole page** (forms + components + rows + content); drop into your own `@defer`. |
| `StepFormsView` | `<ngx-formad-step-forms [step] />` — the forms-only subset of `StepPageView`, for a chrome that never uses `addComponent`. |
| `materializeStep(step, pool, shared, inj)` | Instantiates a step's forms, registers them, wires the sync. Returns a `LiveStep`. |
| `resolveStepForms(step, pool)` | Awaits a step's lazy form loaders into a plain config map (eager ones pass through). |
| `effectiveSteps(steps, ctx)` | The pure conditional filter — the steps whose `when` passes, in order. |
| `LiveStep` / `LiveForm` | `LiveStep = { registry, forms, pages }`; `LiveForm = { name, state, seed(), commit() }`. |
| `InstanceRegistry` | Collects a step's live forms; `completed()` folds `valid()` over the visible ones. |
| `SharedState<S>` | The plain-signal cross-step store; `get(key)`, `patch(partial)`, `select(key)`, `slot(key)`, `snapshot()`. |

### Configure the look (call once)

| Symbol | What it is |
| --- | --- |
| `provideFormadSuite(opts?)` | Registers the three adapters. No args = zero-dependency defaults + the bundled chrome. `controlTypes` (a `ControlTypeMap`) layers custom kinds over the base adapter, app-wide. |
| `ControlAdapter` / `LayoutAdapter` | The control and layout axes; `defaultControls` and `cssLayout` are the defaults. |
| `STEPPER_ADAPTER` / `DefaultStepperChrome` | The chrome axis token and its bundled default component. |

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
createStep((step) => …, {                     // step: StepBuilder<TForms, TShared>
  when?: (ctx) => boolean,                    // ctx: StepContextFor<Stepper<TForms, TShared>>
  optional?: boolean,                         //   ctx.shared : TShared, ctx.value('x') : that model
  defer?: 'idle' | 'viewport' | 'interaction',
  completeWhen?: () => boolean,               // extra gate, ANDed with the form fold (see below)
})
branch((ctx) => key, {                        // ctx: StepContextFor<…>; key narrows `branches`
  [key]: (b) => b.step((step) => …, opts?)    // b: BranchBuilder — guarded steps; nests via b.branch()
})
fork((ctx) => key, {                          // TERMINAL — only build() after; arms don't rejoin
  [key]: (arm) => arm                         // arm: ForkArmBuilder — its own state/forms/steps
    .createStep((step) => …)
    .result((ctx) => ({ kind: key, … })),     // each arm's result → union into TResult
})
step.createPage({ options: PageOptions }, (page) => …)    // page: PageBuilder<…>
page.addForm((f) => f.name, {                 // f: FieldRefs<TForms> — declared forms only
  submitLabel?: string,
  visibleWhen?: () => boolean,                // auto-@if'd by the renderer
  bind?: (l: SharedLink<Model, Shared>) => void,   // m = selected form's model, s = shared shape
  effects?: (e) => e.on(m => m.taxId, 'resolved', (payload, model) => // control output → model patch
    model.update(m => ({ ...m, companyName: payload.name }))),       //  (VAT-ID autofill)
})
page.addComponent(Component, { inputs, outputs, visibleWhen?, layout? })  // typed to the component
page.addContent({ layout? })                  // a bare layout slot
page.insertRow('grid-cols-2', (row) => …)     // a nested PageBuilder
```

## Live examples

A runnable showcase ships under `projects/examples` — a storefront self-service
portal with three multi-step flows (Return, Complaint, Warranty). From the workspace
root:

```bash
pnpm examples   # builds the library, then serves the example app
```

It focuses on the config-form and orchestration concepts (dynamic-component slots
via `addComponent` and the `completeWhen` gate are exercised by the unit tests, not
these flows). It demonstrates, end to end:

- **Config-only forms**, including a **nested address group** on the billing step
  (renders as a fieldset, validates by nested path).
- A **custom chrome over `StepperController`** — the host (`WizardHost`) is a
  bring-your-own-UI chrome that reads the controller's signals and actions rather
  than re-implementing the engine; the numbered rail, banners, and validation
  summary are all its own.
- **Directional autofill** (the tax ID typed on step 1 arrives prefilled on the
  billing step, with a "we pre-filled this" banner).
- **An optional step** (Skip) and a **fork** — the return's *Refund* step splits into
  *store credit* vs *card refund*, two arms with **different typed results** that the
  success screen reads back.
- **Validation surfaced two ways** — inline on blur, plus a summary that lists every
  offending field (nested ones included) when you press Continue on an invalid step,
  with navigation gated on the completion fold.

## Migrating an existing form

Take a typical reactive-forms feature: a multi-step **checkout** wizard with a nested
model (an order with `shippingAddress.*` and `billingAddress.*`, plus a gift-options
sub-form), Material controls, an async **country / region** `<select>`, and an **"apply
promo code"** button mid-form. Here's the path — and the honest trade-offs.

**1. It runs on signal forms, not reactive forms.** ngx-formad renders a native
`form(model)` `FieldTree`, not a `FormGroup` — there's no wrapper, so adopting it
means moving that form to signal forms. Do this **risk-first on one small form**, not
the whole checkout at once. (formodel is the one peer dep to add.)

**2. Nested models map directly — no hand-flattening.** The `shippingAddress.*` /
`billingAddress.*` / gift-options objects become groups; see
[Nested groups](#nested-groups). Validity folds over the whole tree natively, and
prefill paths stay readable.

**3. Material / Tailwind is a one-time adapter, not throwaway.** Write a
`ControlAdapter` mapping kinds to `mat-form-field`/`mat-select` and a `LayoutAdapter`
for your grid **once**, and every form reuses them. See [Theming with adapters](#theming-with-adapters).

**4. The wizard shell maps cleanly.** `StepperBuilder` + `withState` + `createStep`,
including prefill links (e.g. an email entered at the cart step arrives in the billing
step via `bind`). This is where the payoff is clearest — repetitive field
declarations and `<mat-form-field>` markup collapse into config.

**5. Dynamic and business behaviors use the escape hatches:**

| Behavior | Where it goes |
| --- | --- |
| Async `<select>` options (country / region) | A control adapter that reads options from a signal — feed it from the node or a service. |
| "Apply promo code" / "look up by SKU" mid-form | A dynamic component slot, `page.addComponent(PromoCard, …)`, that writes into shared/fields. |
| Member-only fields, conditional sections | `visibleWhen` on a field/component, `when` on a step. |
| Guest vs. business-account checkout | [`branch`](#branching) (rejoins) or [`fork`](#forking) (different result). |
| Nested address objects, line-item repeaters | [Nested groups](#nested-groups) and [repeating arrays](#repeating-arrays) — both render and bind natively. |

**Material is one import, not a hand-written adapter.** `provideFormadSuite({ controls:
materialControls })` from [`ngx-formad/material`](#angular-material) gives you
`mat-form-field`/`mat-select`/`mat-checkbox` across every form — so step (3) is now
"install and wire", not "write".

**What to expect.** The boilerplate reduction is the main benefit; the remaining real
cost is the reactive→signal move (1). A pragmatic order: migrate the **shell + a couple of flat
steps** (cart, contact) first, then bring over the nested address steps and any
line-item arrays — both render, validate, and bind today.

## FAQ

**What problem does ngx-formad solve?** Angular signal forms are headless — they own
value and validation but render nothing. ngx-formad renders forms from configuration
and orchestrates multi-step wizards, so you stop hand-writing a template per form.

**Does it replace Angular signal forms?** No. It renders *on top of* them. Your
`schema`, `FieldTree`, and `FieldState` are the real native ones.

**Which Angular versions are supported?** Angular **21.2+ and 22**, from one package.

**Can I use Material, PrimeNG, or Tailwind?** Angular Material ships ready-made — add
`ngx-formad/material` and `provideFormadSuite({ controls: materialControls })`. For
PrimeNG or Tailwind, write a control and/or layout adapter. The three axes (controls,
layout, stepper chrome) are independent. See [Angular Material](#angular-material).

**Can I restyle the whole wizard shell?** Yes — write a stepper chrome (a component
whose only input is the `StepperController`) and register it with
`provideFormadSuite({ stepper })`. The orchestration is reused; you draw the look. See
[Writing a stepper chrome](#writing-a-stepper-chrome).

**Do I need to write templates?** No. Fields, layout, visibility, and dynamic
components are config; the renderer produces the DOM, including the `@if` on visibility.

**Does it support nested forms, arrays, and nested binding?** Yes to all three —
nested objects render as fieldsets, model arrays render as Add/Remove repeaters, and
`bind`/`value(...)` reach nested fields by path. All validate natively. See
[Nested groups](#nested-groups) and [Repeating arrays](#repeating-arrays).

**Is it accessible?** The default controls wrap their input in a `<label>` and wire
`aria-invalid` / `aria-describedby` to an `role="alert"` error and `aria-required`;
the bundled chrome moves focus to each new step. (The Material adapter inherits
Material's own a11y.)

**How do I migrate an existing reactive-forms feature?** Risk-first: move one small
form to signal forms, add `ngx-formad/material`, then bring over the wizard shell and
steps. Full walkthrough and trade-offs in
[Migrating an existing form](#migrating-an-existing-form).

**Can steps be conditional, optional, or branch?** Yes. `createStep(build, { when })`
makes a step conditional, `{ optional: true }` makes it skippable, and `{ defer }`
renders it inside `@defer`. For multi-step paths, `branch(select, { … })` groups
guarded steps by key — pure sugar over `when`, so **branches rejoin automatically**.
See [Conditional, optional & lazy steps](#conditional-optional--lazy-steps) and
[Branching](#branching).

**What's the difference between branch and fork?** A **branch** varies the middle of
one flow and rejoins to a single outcome. A **fork** commits to one of several
sub-flows that *don't* rejoin, each producing its own **typed, discriminated result**.
Use fork when the input decides *what the wizard becomes*. See [Forking](#forking).

**Can a form load lazily?** Yes. `createForm(name, () => import(...).then(m => m.form))`
fetches the form's config only when its step is reached; eager steps stay synchronous.

**Can I bring my own wizard UI?** Two levels. For a restyle, write a **chrome** over
the shared `StepperController` (above). For total control, the primitives —
`StepperController`, `materializeStep`, `effectiveSteps`, the instance registry — let
you build a host from scratch, as the live example's `WizardHost` does.

**Will a big wizard cause input lag?** It is designed not to — see [Performance](#performance). Nothing builds ahead of time, typing does not wake the orchestrator, and navigation defers the form build off the click.

## License

[0BSD](./LICENSE) — BSD Zero Clause License. Use it for any purpose, with or without attribution.
