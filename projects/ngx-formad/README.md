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

> **Status — pre-1.0.** This is `0.10.0`, built on the signal-forms API that is
> *experimental* in Angular 21. Both the API underneath and this library's own surface
> may change in breaking ways before a 1.0; minor versions carry breaking changes, listed
> in the [changelog](./CHANGELOG.md). It has unit tests but no significant production
> track record yet; evaluate it on a small form first.

## Quick look

Describe forms as data; get rendered, validated forms — and sequence them into a
wizard. No templates either way.

**A form** — config in, a rendered form out:

```ts
import { UiFormConfigBuilder, email, text } from 'formodel';
import { FormRenderer, instantiateForm, FormConfig } from 'ngx-formad';

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
  readonly state = instantiateForm(leadForm);
}
```

```
OUT — rendered with zero adapters (plain HTML, CSS grid):

┌ Email ─────────────────────────────┐
│                                    │
└────────────────────────────────────┘
┌ Company ───────────────────────────┐
│                                    │
└────────────────────────────────────┘
```

**A wizard** — sequence forms into steps; a shared key prefills the next one:

```ts
import { StepperBuilder, StepperComponent } from 'ngx-formad';

// IN — two forms sequenced; `Company` typed on step 1 prefills step 2
const wizard = new StepperBuilder()
  .withState({ company: '' })
  .createForm('lead', leadForm)
  .createForm('billing', billingForm) // another FormConfig with a `company` field
  .createStep((step) =>
    step.createPage((page) => page.addForm('lead', { fieldValueBindings: (f, s) => [link(f.company, s.company)] }), {
      heading: 'Your details',
    }),
  )
  .createStep((step) =>
    step.createPage((page) => page.addForm('billing', { fieldValueBindings: (f, s) => [link(f.company, s.company)] }), {
      heading: 'Billing',
    }),
  )
  .build();

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="wizard" />`,
})
class SignupWizard {
  readonly wizard = wizard;
}
```

```
OUT — a navigable wizard with a completion gate and autofill:

Step 1 of 2 — Your details                Step 2 of 2 — Billing
┌ Email ───────────────┐                   ┌ Company ─────────────┐
│                      │       Next →      │ Acme Inc.            │  ← prefilled
└──────────────────────┘     ───────▶      └──────────────────────┘    from step 1
┌ Company ─────────────┐                   ┌ VAT ID ──────────────┐
│ Acme Inc.            │                   │                      │
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
- **Flows that bend to the data** — conditional, optional, lazy, deferred and dynamic steps; branching that rejoins, forking that returns a typed result, and rings that repeat a pass and fold it into a state.
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
import { FormRenderer, instantiateForm, FormConfig } from 'ngx-formad';

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
  template: `<ngx-formad-form [state]="state" />`,
})
export class ArticleEditor {
  // `instantiateForm` calls native `form()` and creates the formFields, so it runs
  // here, in an injection context. The renderer only draws what the state holds.
  readonly state = instantiateForm(articleForm);
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
`state.view` is the form's view: the container's layout classes and one row per node,
each row carrying the injector its formField component is created from. The renderer
walks that view and nothing else.

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
    .build(),
};
```

An overlay draws only what it names: a field of `ui` that no `field()`, `fields()` or
`control()` places is left out. In dev mode the form warns once per layout about such
fields; a field left out on purpose (a value the model carries but the page never shows)
is declared `.omit('key')`, and the warning skips it. `omit()` is about the *view* and
nothing else: the field is still in the schema, so it still validates and still counts
towards the step's completion — a required field nobody draws holds Next forever.
Excluding a field from validity is the schema's job (`hidden()`, below). And `omit()`
does not excuse a `customField()` from `control()`: that refusal is a type, and a layout
cannot carry its omitted keys into it without threading them through `FormConfig` too, so
a `customField()` the page never draws should not be declared as one.

A field whose editor is a specific `FormValueControl` component, not a registered kind,
is declared `customField()` in `ui` and placed with `.control(key, config)`. The layout only
places: the renderer binds `FormField` to the field itself, and everything else the
component takes is declared where the form is instantiated (see [Bindings](#bindings--one-place-per-form-instance)):

```ts
const pickForm = defineForm({
  model: (): Pick => ({ source: '' }),
  ui: { source: customField() },
  layout: formLayout<Pick>().control('source', { component: RadioCards, placement: { colSpan: 2 } }).build(),
});
```

`control(key, config)` takes a `FieldComponentConfig<M[K]>`, so the component must be a
`FormValueControl` of the field's own value type; the layout remembers which component
sits on which field, so the bindings of that field are typed by it. A `customField()`
left without a `control()` placement throws when the form is instantiated. There is no
component slot inside a form: a widget that is not a field belongs to the page.

A `content()` gate may read the **layout context**: the live model value and, inside a
stepper page, the cross-step `shared` store (`null` standalone). Never the field tree.

```ts
.content((c) => c.p('Verified against the catalogue.'), {
  visibleWhen: (ctx) => ctx.model.verified,
})
```

Group a cluster into its own sub-grid with `.row(build, cfg)` — the row's own grid
plus its placement in the parent grid:

```ts
.row((row) => row.fields('city', 'postCode', 'country'), { cols: 3, colSpan: 2 })
```

Prose between the fields - a group heading, a hint under a cluster - is `.content(build)`,
the same tag builder [pages use](#content--prose-as-data), gated on the same context:

```ts
.content((c) => c.h3('Contact for this report'))
.fields('name', 'phone')
.content((c) => c.p('We only call about this report.', { className: 'hint' }), {
  visibleWhen: (ctx) => ctx.model.phone.length > 0,
})
```

Fields left out of the overlay still validate (they are in the schema) but do not
render — list every field you want shown.

**Responsive layout is Tailwind's job, not ours.** `colSpan`/`cols` accept a constant
(`2`) or a per-breakpoint map (`{ base: 1, md: 2 }`). The zero-dependency default
(`cssLayout`) resolves only the `base` value — inline styles cannot carry media
queries. For real responsive layouts register `tailwindLayout`: it composes Tailwind's
own utilities (`grid grid-cols-1 md:grid-cols-2`, `col-span-6`, `gap-4`), so the
library ships no stylesheet and no generator, and your build emits exactly the classes
your configs name.

```ts
import { provideFormadSuite, tailwindLayout } from 'ngx-formad';

provideFormadSuite({ layout: tailwindLayout /* , controls, stepper */ });
```

Tailwind only sees literals in your source, and these class names are composed at
runtime, so name them once beside your import — in v4 that is one line of CSS:

```css
@import 'tailwindcss';
@source inline("{sm:,md:,lg:,xl:,}{grid-cols-,col-span-,col-start-}{1,2,3,4,5,6,7,8,9,10,11,12}");
@source inline("gap-{0,1,2,3,4,5,6,8,10,12}");
```

The breakpoint keys of a responsive value are Tailwind's screens, so they waterfall
upward the way Tailwind's do.

## Tour

A real CMS editor screen is more than one form. It is a *page*: a few forms side by
side, a dynamic component or two (a publish-status banner, a live preview), and blocks
that appear only when relevant — arranged in a layout. You author a page with the
builder. `createPage` hands you a callback where you `addForm` (by name, from a typed
pool), `addComponent`, `addContent` (prose - see [below](#content--prose-as-data)),
`insertRow`, and gate any node — a row and the page itself included — with
`visibleWhen`. Visibility is *data*: the renderer auto-`@if`s on it, so you never write
the `@if`. The same
builder scales to many steps — here we use a single one.

```ts
import { signal } from '@angular/core';
import { StepperBuilder, StepperComponent } from 'ngx-formad';

const status = signal<'draft' | 'scheduled'>('draft');

const editorPage = new StepperBuilder()
  .createForm('article', articleForm) // the form from above, in a typed pool
  .createForm('seo', seoForm) // title + meta description, another FormConfig
  .createStep((step) =>
    step.createPage(
      (page) =>
        page
          .addForm('article') // place the article form by name
          .insertRow((row) => row.addForm('seo'), { layout: 'cols-2' }) // a layout row
          .addComponent(ScheduleNotice, {
            bindings: [inputBinding('when', () => status())], // Angular's own bindings, as createComponent takes them
            visibleWhen: () => status() === 'scheduled', // conditional, as data
          }),
      { heading: 'Edit article' },
    ),
  )
  .build();

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="page" />`,
})
export class EditorScreen {
  readonly page = editorPage;
}
```

That is one screen composed from configuration: the Article and SEO forms render the
way the form section described, the row arranges SEO into its own group, and
`ScheduleNotice` exists in the DOM **only while `status()` is `'scheduled'`** — the
renderer added and removed it for you. Flip the signal back to `'draft'` and the
component is gone, with no `@if` anywhere in your code.

## Content - prose as data

A page is rarely only forms. There is the sentence above the field, the note that
appears when a rule bites, the "or" between two blocks, the hint whose middle word is
a link. All of that used to need a component written for one paragraph, because a
content slot was a bare `<div>`. `addContent` closes that hole: the builder's methods
*are* the tags, and what comes out is the same node tree as everything else here.

```ts
page
  .addContent(
    (c) =>
      c.div({ className: computed(() => `callout ${tone()}`) }, (d) =>
        d
          .span('info', { className: 'material-symbols-outlined', attrs: { 'aria-hidden': true } })
          .p('We found ')
          .insert((p) => p.strong(computed(() => `${products().length} products`)))
          .continue(' in your basket.'),
      ),
    { layout: 'callout' },
  )
  .addForm('issue')
  .addContent((c) =>
    c
      .p('Check the ')
      .insert((p) => p.a('warranty terms', { href: '/terms' }))
      .continue(' first.')
      .ul((list) => list.li('On the product page').li('In your order confirmation')),
  );
```

- **A tag takes its text, its options and its children** - `p('A line', { className },
  (p) => …)` - each optional, sorted out by shape: an object is options, a callback
  that takes the builder is the children, and a signal is text.
  So a container is `div({ className }, (d) => …)`, or just `ul((list) => …)`.
- **`insert(build, at?)` writes *inside* the tag you just added, and leaves the cursor
  there**; `continue(text, at?)` keeps writing text in it. That is how a sentence with
  a link or a `<strong>` in the middle stays one flat chain instead of nesting itself
  in a callback - and both can repeat, so a paragraph can hold two links and the words
  between them. `at` puts the run at a position among that tag's children.
- **Text may be a signal.** `p(computed(() => count() + ' products'))` follows it, and a
  signal is its own binding, so a change touches one DOM node. A constant stays a
  constant on the node - written once, subscribed to never - which also means a fully
  static block is plain data, JSON included. Nothing here takes a bare closure: a value
  that changes is `Signal<T>`, Angular's own type.
- **Content renders as part of change detection**, so it is in server-rendered output;
  hydration of a content block has not been verified yet, so treat SSR + hydration as
  untested rather than supported.
- **`visibleWhen`** gates a tag (and its subtree) or the whole block; a gated tag keeps
  its place in the DOM as `hidden`, so nothing below it jumps.
- **Classes are the whole styling surface.** The library ships no look for content: the
  `className` you pass is yours, resolved by nothing.
- **Nothing is interpolated as markup**, and what a config may ask for is bounded
  three ways - all enforced by the renderer, so a tree that arrived as JSON is bounded
  too: the tag vocabulary is closed (`CONTENT_TAGS`: structure, text, lists, links,
  images, a button - an unknown tag draws nothing), attribute names beginning with `on`
  are refused, and URL-bearing attributes (`href`, `src`, …) are scheme-checked, so
  `javascript:` and `data:text/html` never reach the DOM. It is not a full sanitizer -
  `style` is allowed, as it is in Angular's own bindings - so genuinely untrusted text
  still belongs behind a component you control. Anything interactive beyond a link or a
  button is `addComponent`'s job.

Content is drawn by `Renderer2`, not a template, for one structural reason: recursing
through a component would put its host element between a `<ul>` and its `<li>`. The
tree renders exactly as authored, with no wrapper anywhere.

The same builder works inside a form, as `formLayout(...).content(build, { visibleWhen })`
- [see the layout overlay](#custom-layout-place-fields-and-components-in-a-responsive-grid).

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
    step.createPage(
      (page) => page.addForm('article', { fieldValueBindings: (f, s) => [link(f.slug, s.slug)] }), // article.slug ↔ shared.slug
      { heading: 'Basics' },
    ),
  )
  .createStep((step) =>
    step.createPage(
      (page) => page.addForm('seo', { fieldValueBindings: (f, s) => [link(f.slug, s.slug)] }), // shared.slug → seo.slug (prefill)
      { heading: 'SEO' },
    ),
  )
  .build();

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="wizard" />`,
})
export class PublishWizard {
  readonly wizard = wizard;
}
```

`bind` is a record from model field to shared key, checked both ways: the key must
exist in `withState` and carry the field's value type. A nested group binds through a
nested record (`fieldValueBindings: (f, s) => [link(f.address.city, s.city)]`).

At runtime the shell shows **Basics** with its heading and a Next that refuses to
advance until the step is valid — that is the completion gate. Type a slug and
advance, and **SEO opens with its slug already filled in**, because both fields bind
the same shared key and the value flowed forward. Edit it on SEO, go Back, come
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
and none of it is imperative — it's all data the engine reads from the live context:

- **Nested models** render as nested fieldsets — an Article with an `seo: { title,
  metaDescription }` object becomes an SEO group with no extra work. See
  [Nested groups](#nested-groups).
- **A step can be conditional or optional** — `createStep(build, { when })` drops a
  step that doesn't apply; `{ optional: true }` lets the user skip it.
- **The end can fork.** Publishing splits — *publish now* vs *schedule* — into two
  short arms with **different results**:

```ts
  .fork((ctx) => ctx.shared.mode(), {
    now:      (arm) => arm.createStep(/* confirm */)
                          .result(() => ({ kind: 'published' as const })),
    schedule: (arm) => arm.createForm('when', whenForm)
                          .createStep(/* pick date */, { name: 'when' })
                          .result(({ steps }) => ({ kind: 'scheduled' as const, at: steps.when?.when.model().at })),
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
stepper folds its completion gate and lists its `blockers`.

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
fields too** — `fieldValueBindings: (f, s) => [link(f.address.city, s.city)]` links a nested field to a shared
key, so cross-step prefill works at any depth.

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
import { DeferTrigger, StepperBuilder } from 'ngx-formad';

new StepperBuilder()
  .withState({ accountType: 'user' as 'user' | 'admin' })
  .createForm('basics', basicsForm)
  .createForm('adminConfig', () => import('./admin').then((m) => m.adminConfigForm)) // lazy
  .createForm('userMeta', userMetaForm)
  .createForm('review', reviewForm)
  .createStep((s) => s.createPage(/* Basics */), { name: 'basics' })
  .createStep((s) => s.createPage(/* Advanced */), {
    activeWhen: ({ steps }) => steps.basics?.basics.model().accountType === 'admin', // (a) a prior step
    defer: DeferTrigger.Idle, // render this heavy step inside @defer
  })
  .createStep((s) => s.createPage(/* Settings */), {
    activeWhen: ({ shared }) => shared.accountType() !== 'admin', // (b) shared state
  })
  .createStep((s) => s.createPage(/* Notes */), { optional: true }) // shows a Skip button
  .createStep((s) => s.createPage(/* Review */)) // ungated — admin & user paths rejoin here
  .build();
```

- **`activeWhen(ctx)`** is typed against the wizard you're building — `ctx.steps` is the
  record of the NAMED steps before this one, each exposing the live instances it
  placed by pool name (`steps.basics.basics` is a `FormState`: `.model()`,
  `.rootForm`), and `ctx.shared` is your `withState` shape as one signal per key (both
  autocomplete; unknown keys are compile errors). It reads from three sources:
  **(a)** a previous step's live instance via `steps`, **(b)** the cross-step `shared`
  state, and **(c)** anything you close over — ignore the arg and read an external
  signal. A gate may run before its predecessors exist, so every entry of `steps` is
  optional there; a step under `when` (or in a branch arm) is optional everywhere.
  It is reactive: flip the value and the step appears or disappears, and the
  sequence re-shapes live. Unnamed steps are reachable by authored index only —
  fragile under reordering — so name any step another one reads.
- **`optional: true`** makes the step skippable — the bundled shell renders a **Skip**
  that advances past the completion gate.
- **`completeWhen(ctx)`** is an extra gate ANDed with the form fold, reading the same
  typed context as `when` (plus anything you close over). A step whose body is a
  dynamic component rather than a form contributes no fields to the fold, so it is
  otherwise *vacuously complete* and Next is always enabled; `completeWhen` lets it
  gate Next on its own state — e.g. `{ completeWhen: ({ shared }) => shared.consented }`.
  Pair it with **`incompleteMessage`** ("Accept the terms to continue") — that is what
  the blocked-Next explainer shows when this guard is what holds. It is reactive.
  For a component that *carries a value* (a picker, a selection grid), put the value in
  a form field and place the component with `formLayout().control(...)`: its validity
  gates Next declaratively and its errors explain themselves.
- **Lazy forms** — pass `createForm(name, () => Promise<FormConfig>)` and the config is
  fetched only when its step is reached (eager steps stay synchronous). The pool type
  still records `FormConfig<M>`, so `addForm`/`bind`/`steps` are unchanged.
- **Seeding from a predecessor** — `addForm('details', { initial: ({ steps }) =>
  ({ manufacturer: steps.maker?.maker.model().manufacturer }) })` starts THIS instance
  from another step's live value when the step comes to life. It is the LOCAL channel;
  `bind` (through shared state) is the global one — the same value should not travel
  both ways. An entry whose value is `undefined` leaves the field's own default alone.
- **What a revisit does is the author's call, per placement.** By default a step the
  user comes back to is exactly as they left it: `initial` ran once, and the fields
  keep what was typed — an address page does not reset because the cart was confirmed.
  Two opt-in policies, both enums: `addForm(name, { revisit: FormRevisit.Reseed })`
  reads `initial` again from the current context on every entry and writes it into the
  fields the user has not edited (the pristine gate `bind` uses); `createStep(build,
  { revisit: StepRevisit.Fresh })` drops the step on entry and builds it again, pages
  and forms alike, so nothing typed there survives. Shared links are reapplied to
  pristine fields on every entry regardless.
- **A page node bound and gated on the context** — `addComponent`'s `bindings` takes a
  callback over the same typed context beside the plain array, so a component on an
  ordinary step binds to what earlier steps hold: `bindings: (ctx) =>
  [inputBinding('plan', () => ctx.steps.basics.basics.model().plan)]`. The callback runs
  once, when the step is materialized, over a context of getters — read it *inside* the
  binding's own getter and the input follows the live tree afterwards, a predecessor
  rebuilt by `StepRevisit.Fresh` included. **`visibleWhen` takes the same context**
  everywhere a page has one — `addComponent`, `addForm`, `addContent`, `insertRow` and
  `createPage` itself; it is a `computed` the renderer `@if`s on, so it follows what it
  reads by itself. A container's gate takes its children with it, completion included:
  a form inside a hidden row (or on a hidden page) is not drawn *and* does not hold
  Next, so a required field nobody can see cannot block the wizard. Neither callback
  needs `pages: StepPages.OnEntry` — the page's structure does not depend on the
  context here, only one input and one `@if` do.
- **Pages built on entry** — a step declared `pages: StepPages.OnEntry`,
  `createStep((step, ctx) => …, { pages: StepPages.OnEntry })`, builds its pages when it is entered, so which pooled forms it
  places and what prose it shows can follow the user's earlier answers (`ctx.steps`,
  `ctx.shared`). The callback must be pure. By default (`StepPages.Once`) a step is built once, at
  authoring time, and a callback that takes `ctx` is refused at compile time. In-form
  conditionality stays `hidden()` / `visibleWhen`; building on entry covers only what those
  cannot: the page's structure. One input or one gate over the context is not that —
  those are the callbacks above.
- **`defer`** renders the step's body inside an Angular `@defer` block
  (`DeferTrigger.Idle`, `.Viewport` or `.Interaction`) with a placeholder while it
  hydrates.

The built `Stepper` is the source of truth for these types: `CommittedOf<typeof built>`
is the shape of everything it commits — `{ [step]?: { [poolName]: model } }` — so a
host narrows the erased `stepCommitted` record once, at the boundary. Hosts compose
the same primitives the shell uses — `effectiveSteps(steps, ctx)` (the conditional
filter), `resolveStepForms(pages, pool)` (await lazy configs) and
`materializeStep(pages, options)` — and drive their own `@defer` with any trigger.

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
  .branch((ctx) => ctx.shared.plan(), {
    //        ▲ ctx is the same typed context as `when`: read shared or steps
    pro: (b) =>
      b
        .createStep((s) => s.createPage(/* Billing */))
        .createStep((s) => s.createPage(/* Seats */), { activeWhen: ({ shared }) => shared.plan() === 'pro' }),
    free: (b) => b.createStep((s) => s.createPage(/* Free note */)),
  })
  .createStep((s) => s.createPage(/* Done */)) // ungated — both branches rejoin here
  .build();
```

The selector is typed against the wizard (`ctx.shared.plan` autocompletes); returning
`null` selects no branch — nothing is guessed. Branches **nest** (`b.branch(...)`),
and a step's own `when` is ANDed with the branch guard. Because branching reduces to
conditions, the `steps` source works too: branch on a named predecessor's live answer,
not just on shared. A branch step is gated by nature, so successors see it as
`| undefined`.

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
  .fork((ctx) => ctx.shared.kind(), {
    individual: (arm) =>
      arm
        .withState({ ssn: '' })                     // arm-local state
        .createForm('person', personForm)
        .createStep((s) => s.createPage(/* personal */), { name: 'person' })
        .result(({ steps }) => ({ kind: 'individual' as const, ssn: steps.person?.person.model().ssn })),
    business: (arm) =>
      arm
        .withState({ vat: '' })
        .createForm('company', companyForm)
        .createStep((s) => s.createPage(/* company */), { name: 'company' })
        .createStep((s) => s.createPage(/* seats */))
        .result(({ steps }) => ({ kind: 'business' as const, vat: steps.company?.company.model().vat })),
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
renderer creates it with `createComponent` and the native `FormField` directive bound to
the field, so **value, errors, touched, dirty, disabled and required all sync from the
field tree automatically** — you only render them. Presentational extras (label,
placeholder, input `type`, select `options`, textarea `rows`) arrive as plain inputs
from the node; a prop authored as a signal is read live.

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

The three types: `GridLayout` = `{ cols?: Responsive<number>; gap?: number }` (`gap`
in 0.25rem steps, Tailwind's scale); `GridPlacement` = `{ colSpan?: Responsive<number>;
colStart?: Responsive<number> }` (per field, from `formLayout().field(key, placement)`
or a `control()`'s `placement`); both methods return `LayoutClasses` = `{ class?:
string; style?: Record<string, string> }`. A `Responsive<number>` is a constant or a
per-breakpoint map; `responsiveEntries(value)` unfolds either into `[breakpoint,
value]` pairs, `base` first, which is what the two bundled adapters do. So one spec
resolves differently per adapter — your form config never changes:

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

    @if (c().nextBlocked()) {
      <aside role="alert">   <!-- why Next refused: labeled, human-readable -->
        @for (issue of c().blockers(); track $index) {
          <p>{{ issue.label }}: {{ issue.message }}</p>
        }
      </aside>
    }

    <footer>
      <button [disabled]="!c().canBack()" (click)="c().back()">Back</button>
      @if (c().optional()) {
        <button (click)="c().skip()">Skip</button>
      }
      <!-- keep Next clickable: a blocked click *explains* instead of advancing -->
      <button [attr.aria-disabled]="!c().canNext()" (click)="c().next()">
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

`StepperController` exposes signals - `step`, `loading`, `index`, `total`, `label`
and `labels` (the current step's short name, and every visible step's, in sequence
order - the progress rail; both derive from the same condition-filtered sequence as
`index`/`total`, so a gated step leaves the rail and the count together), `heading`,
`subheading`, `validating` (a validator on this step is still running - the gate is
closed and no field has an error to show), `canBack`, `canNext`, `nextBlocked` + `blockers` (why a
refused Next refused: every visible invalid field's labeled errors, plus the step's
`incompleteMessage` when `completeWhen` is what holds — see [the blocked-Next
explainer](#a-blocked-next-explains-itself)), `isLast`, `optional`, `deferTrigger`,
`result`, `committed` (every last-committed model, keyed by step and then by pool
name — the data-egress for persisting as you go) and `progress` (the nesting-aware
rail model, one level per flow along the active chain) — and the actions `next()`,
`back()`, `skip()`, `goTo(target, options?)` (jump to a step by position or by label),
`reset()` (restart: clears committed values, resets shared state, re-enters the first
step), `dockRestart()` (reopen the innermost ring standing on its dock) and
`destroy()` (tear down the flow's injection environment; the shell calls it). Calling
`next()` while the gate is closed does not navigate: it marks everything touched and
raises `nextBlocked`, so keep the button clickable (`aria-disabled`, not `disabled`)
and let it answer.

#### A flow that repeats — recurrent steppers

A step list is a sequence, and some flows are rings: "add another device" runs the
same steps again and lands back on a list. Before 0.9 that loop had to be spelled as
a jump; now it is its own abstraction, equal in rank to the linear stepper. A
recurrent stepper is *pass steps* around a *dock*: finishing a pass folds its values
into the flow's own state (a pure `(state, pass) => state` over the accumulator
`initial` declares), the dock can only reopen the ring or complete the flow, and entry
is conditional — a state for which `dockReachable` holds lands on the dock, any other
opens a pass on its first step (without `dockReachable`, the dock is reachable once a
pass has folded). Validity derives from the state (`completeWhen`), never from the
path taken to it.

```ts
new StepperBuilder()
  .withState({ source: '' })
  .createRecurrentStepper('devices', {
    label: 'Devices',
    state: (): Device[] => [],
    dockReachable: (devices) => devices.length > 0,
    build: (loop) =>
      loop
        .createForm('details', detailsForm)
        .createStep((s) => s.createPage((p) => p.addForm('details')), { name: 'details' })
        // the pass context: the pass's own named steps, live — fresh every pass
        .fold((devices, pass) => [...devices, toDevice(pass.steps.details?.details.model())])
        // the dock reads the folded state through the bindings callback, and its own
        // completeWhen IS the flow's contract - there is no way out of a ring but the dock
        .dock(
          (s) =>
            s.createPage(
              (p) => p.addComponent(DeviceList, { bindings: (ctx) => [inputBinding('devices', () => ctx.flow.state())] }),
              { heading: 'Your devices' },
            ),
          { completeWhen: (ctx) => ctx.flow.state().length > 0, incompleteMessage: 'Add at least one device' },
        ),
  })
```

The flow occupies ONE slot of the parent sequence — one entry in the rail, one
`index()` position — and renders through the same single chrome, however deep. Later
steps read the state as `ctx.steps.devices`, typed to what `initial` declared. A
nested flow has its own namespace of step names (the same name may recur on another
level) and reaches the level above explicitly through `ctx.parent`; its `ctx.shared`
layers its own `withState` over the parent's; inside a ring `ctx.flow` exposes the
`state` and `passOpen` signals.
A dock component stays dumb: it injects the two-method `FlowDock`, or marks its
buttons with `ngxFormadDockRestart` / `ngxFormadDockNext` — never a controller. The
nesting also runs the other way (`createStepper` puts a linear sub-flow inside a
pass), and a ring built at the root (`new RecurrentStepperBuilder({ initial })`, ending
in `dock(...).build()`) goes straight into `<ngx-formad-stepper>`; its `completed`
carries the state. A chrome that wants to draw the nesting reads
`controller.progress()` — one level per controller along the active chain; a chrome
that ignores it keeps the classic root rail.

`goTo(target, { fresh })` remains the right tool for an "Edit" link on a summary —
not for repetition. It commits the current step first, exactly as Next and Back do,
and a target no step answers to leaves the wizard where it stands. `fresh` discards
the destination's cached instances and those of every step authored after it, so
they are built again from their form factories, seeded from whatever shared state
now holds.
`StepPageView` (`ngx-formad-step-page`) renders a step's **whole page** — forms,
dynamic components, rows, and content slots; wrap it in your own `@defer` to honour
`deferTrigger()`. (`StepFormsView` / `ngx-formad-step-forms` is the forms-only
subset, for a chrome that never uses `addComponent`.) The controller is also
exported, so a fully bespoke host can construct and drive it directly without the
token.

### Performance

A few properties keep the orchestrator off the critical path of typing and clicking:

- **Nothing is built ahead of time.** `build()` is data-only; the controller
  materializes only the *current* step, caches it by node identity and keeps it on
  revisit unless the author's `revisit` policy says otherwise. Later steps don't exist
  until reached — proven by a test that counts model-factory calls.
- **Typing touches what reads it.** A gate reads what it names —
  `ctx.steps.basics.basics.model()` is the live model — so a keystroke re-evaluates
  the gates that read that form and nothing else. The field list is static, and a
  field's validity is its own native signal.
- **Navigation is one write.** The controller's position is an immutable value in a
  single signal; a move replaces it, and the current step, the rail, the gate and the
  blockers are computeds over it. An eager step is materialized in the same action, so
  it is on screen with the next change detection; a step with lazy forms shows
  `loading()` until its configs resolve. Cached steps are instant.
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

// 2 — the kind, declared to formodel once, and a typed helper used like text()/select()
declare module 'formodel' {
  interface CustomControlNodes {
    productPicker: CustomControlNode<Product[], { max?: number }>;
  }
}
const productPicker = customInputType<CustomControlNode<Product[], { max?: number }>>('productPicker');

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

`CustomControlNode<Value, Props>` ties the node to its field by value type — a node
built for `Product[]` is a type error on a `string` field. The renderer hands the
component one `props` input, read live when the node's `props` is a signal. A control
with nothing to configure declares `Record<string, never>` and takes an empty bag. The
product step, VAT-ID lookup, and similar widgets all become plain config fields this
way; a widget used on one field only needs no kind at all — declare the field
`customField()` and place the component with `formLayout().control(...)`.

### A blocked Next explains itself

The classic wizard dead-end: every visible form is valid, yet Next stays greyed out —
some `completeWhen` holds the gate, and the user
has no idea what it wants. The suite treats a blocked Next as a question, not a wall:

- The bundled chrome's Next is **never `disabled`** (it carries `aria-disabled` and a
  `ngx-formad-blocked` class for styling). A dead button can't be clicked, so it can't
  explain itself.
- Clicking Next while the gate is closed does not navigate. The controller marks every
  field **touched** (so each shows its own errors in place) and raises
  `nextBlocked`; the chrome renders `blockers` — every visible invalid field's labeled
  errors (`Plan: Pick a plan first.`), plus the step's `incompleteMessage` when a
  `completeWhen` guard is what holds.
- The display is reactive and self-retracting: fix the last problem and the list (and
  `nextBlocked`) clears without another click — no stale error box.

Give every `completeWhen` an `incompleteMessage`. The guard is an opaque predicate —
without the message, the explainer can only say *"This step is not complete yet."*

## Reactive props — seed a select after the form exists

Options often arrive later than the form: a country list from an API, sub-categories
that depend on an earlier answer. Any *presentational* prop of a control node —
select/radio `options`, `label`, `placeholder`, a date's `limit`, a custom control's
`props` — may be a **signal** instead of a value. The renderer reads it live; set the
signal whenever the data lands and the control follows. Nothing re-instantiates.

```ts
const countries = signal<SelectOption[]>([]); // empty at first

const addressForm = defineForm({
  model: () => ({ country: '' }),
  ui: { country: { type: 'select', label: 'Country', options: countries } },
});
```

`defineForm` (or `satisfies FormConfig<M>`) keeps the *authored* type, so the live
state hands your signal back writable — the form state is the one handle you need:

```ts
const state = instantiateForm(addressForm);
state.ui.country.options.set(await api.countries()); // the rendered select updates
```

formodel itself stays plain and framework-agnostic: its helpers (`select`, `text`, …)
take values, not signals. The widening lives in ngx-formad's `SignalUiConfig<M>`, which
`FormConfig` applies over the whole ui: every prop accepts `T | Signal<T>`, so a field
whose prop should follow a signal is authored as a literal node, like `country` above,
next to builder-made siblings.

This costs nothing where you don't use it: the widening is type-level. A prop is taken
in **once**, where the field is mounted (`extraInputsFor`): a plain value is wrapped in
a `signal()` there and everything downstream — the mount, the adapters, the error
summary — holds a `Signal<T>` and just calls it. Nothing asks again what shape the value
arrived in. Structural config stays static by design (`type`, group/array shape, a
custom kind's `props`): fields that appear and disappear are the schema's job
(`hidden()`, below), not a prop binding.

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
@Component({ selector: 'app-summary', imports: [JsonPipe], template: `{{ data() | json }}` })
class Summary {
  private readonly wiz = inject(FormadWizard, { optional: true }); // null outside a stepper
  protected data = computed(() => this.wiz?.committed());           // { [step]: { [poolName]: model } }
}
```

`FormadWizard` exposes `committed()` (the same record the shell emits as
`stepCommitted`), `controller()` (the `StepperController` → `step()`, `result()`,
`progress()`, …; `null` until the shell has built it) and `shared`
(`get`/`patch`/`select`/`snapshot`; `sharedOrNull()` when the widget may also render
outside a stepper). Summaries stay free-form — you read the data and render it however
you like.

## Bindings — one place per form instance

Everything a field's component is bound with beyond what `FormField` binds — its
inputs, its outputs, its two-way ones — is declared in ONE place per abstraction: the
second argument of `instantiateForm(config, bindings)` for a form on its own,
`bindings` in `page.addForm(name, cfg)` inside a stepper. The record is
keyed by the form's field names; under a field sit `inputs` and `outputs`, each keyed by
the component's own names, so the keys are typed by the component that draws the field:
the one the layout placed with `control()`, or the one `ControlComponents` registers for
the field's kind. `inputs` takes the input's own type — a static value — `outputs` a
handler over the payload and the context, and anything reactive goes through Angular's
own `bindings: [inputBinding('options', theSignal)]`:

```ts
// the registry, typed once: kind → component class
declare module 'ngx-formad' {
  interface ControlComponents {
    text: typeof TextControl;
    taxId: typeof TaxIdControl; // emits `resolved`
  }
}

page.addForm('thirdParty', {
  bindings: {
    taxId: {
      inputs: { label: 'VAT ID' },
      outputs: {
        resolved: (company: Company, ctx) =>
          ctx.model.update((m) => ({ ...m, companyName: company.name, address: company.address })),
      },
    },
  },
});
```

The context is the form's writable `model`; inside a stepper it is the step's context
with `model` layered in, so a handler reads `ctx.steps`, `ctx.shared` and the form it
belongs to alike. It is read again on every emission, so `ctx.steps` names the steps
alive when the output fires, not those alive when the step was entered. In dev mode a
name bound on the wrong side (an output under `inputs`, or the reverse) throws when the
form is instantiated, and a name the component declares nowhere is a warning. The handler runs a *programmatic* model write, which stays pristine —
so it never trips the seed-if-pristine gate of cross-step prefill. This is how the VAT-ID
autofill is config, not a bespoke component.

The types follow the config: keep `defineForm(...)` (or `satisfies`) rather than an
annotation `: FormConfig<M>`, since the annotation erases both the field kinds and the
placed components, and author `ui` as a literal where a field's kind must stay exact -
the formodel builder hands back the wide `UiFormGroupConfig<M>`. A group nests its
record; a repeating group binds every item's fields alike.

## Effects — a side effect that lives as long as the form

What the form's state has to reach outside the signal graph (a draft kept in storage, an
analytics event, a focus) is an effect: `instantiateForm(config, bindings, effects)` takes
them as its third argument, `addForm(name, { effects })` inside a stepper. Each
is `(ctx) => void` over the same context handlers get, run as an Angular `effect()`
created when the instance is, and ended with it - a step that is dropped (`StepRevisit.Fresh`,
a restarted pass) ends its forms' effects too.

```ts
instantiateForm(orderForm, null, [
  (ctx) => sessionStorage.setItem('order-draft', JSON.stringify(ctx.model())),
]);
```

## When the library refuses

Three ways to say no, one rule for which:

- **A `Rejected<...>` type** where the mistake is visible in the types: bindings for a
  field whose kind is unknown or not exact, a `customField()` no `control()` can place,
  `createPage(options, build)` the wrong way round, a `(step, ctx)` callback without
  `pages: StepPages.OnEntry`, `addControlType` on a kind that exists. The message names
  the fix and sits on the offending argument, so the error is reported at that call.
- **A `throw` at authoring time** for invariants a type cannot see: a step or form name
  already taken, a second `dock`, arguments swapped past the type check, a field the
  model does not carry. These run while the config is being built - before anything
  renders - so they surface in the first test that touches the flow.
- **A dev-mode `console.warn`** only where nothing can prove intent: fields a layout
  neither places nor `omit()`s, a binding name the component's mirror does not declare
  (host directives and inheritance put some names beyond it). Never for something the
  library could have known.

## API

Everything is exported from the package root (`ngx-formad`).

### Render a single form

| Symbol | What it is |
| --- | --- |
| `FormConfig<M, U, P>` | A form as data: `{ model: () => M; ui: U; schema?: SchemaOrSchemaFn<M>; layout?: FormLayout<M, P> }`. `U` is the authored formodel ui, widened by `SignalUiConfig<M>` so any presentational prop may be a signal; `P` names the components the layout placed, by field. |
| `defineForm(config)` | Identity that keeps `U` and `P`, so `state.ui.<field>.<prop>` hands a signal back writable and the bindings are typed. |
| `instantiateForm(config, bindings?, effects?)` | Turns a `FormConfig` into a live `FormState<M, U>`: calls native `form()`, builds the view and the mount of every formField, wires the bindings, starts the effects. Needs an injection context. |
| `instantiateRuntimeForm(config, options?)` | The erased variant the stepper uses; `InstantiateOptions = { injector?, shared?, bindings?, effects?, context? }`. |
| `FormBindings<M, U, P, Ctx>` | What `instantiateForm` and `addForm` take: field name → `{ inputs?, outputs?, bindings? }` — static inputs typed by the component, output handlers (`(payload, ctx) => void`), and Angular `Binding[]` for reactive ones, typed by the placed component or by `ControlComponents[kind]`. |
| `ControlComponents` | The typed side of the control registry, kind → component class; augment it in the application. |
| `FormEffect<Ctx>` | `(ctx) => void`, run as an `effect()` for the life of the instance. |
| `FormContext<M, U>` | What a callback inside one form reads: `{ model: WritableSignal<M>; ui; fields }` — a layout gate, a field's output handler and an effect alike. Inside a stepper the object also carries the step's level, which the placement types (`StepFormContext`). |
| `StepperContext` / `StepContext<TCtx, TForms>` | The context of a flow (`steps`, `shared`, `flow`, `parent`) and, one level in, the same plus `forms` — the instances that very step placed. `activeWhen` and `completeWhen` read the first, a page's gates and bindings the second. |
| `link(field, slot)` / `FieldRefs<M>` / `SharedSlots<TShared>` | `fieldValueBindings`' vocabulary: typed field references and store slots, joined by `link`, so a link names nothing by string. |
| `FormState<M, U>` | `{ model; rootForm; ui; nodes; fields; grid?; view; destroy() }` — `nodes` is the render tree, `fields` the flat leaves (each with `path`), `view` the `FormLevel` the renderer draws, `destroy()` ends the effects. |
| `FormLevel` / `ViewRow` | One level's container classes and its rows: `ControlRow` (a formField and the injector its mount point creates it from), `GroupRow`, `ArrayRow` (`items()`, `add()`, `remove(i)`), `LayoutRow`, `ContentRow`. |
| `RenderNode` | A render-tree node: `ControlNode` \| `GroupNode` \| `ArrayNode` \| `FormContentNode` \| `FormRowNode`. `buildNodes(ui)` builds it from the ui, `buildLayoutNodes(ui, items)` from an overlay. |
| `formLayout<M>()` | The layout overlay builder: `cols`, `gap`, `field`, `fields`, `control`, `content`, `row`, `build()`. |
| `FieldComponentConfig<T, C>` | What `control(key, …)` takes: `{ component: Type<C>; placement?: GridPlacement }`, `C` a `FormValueControl<T>`. |
| `SignalUiConfig<M>` | `ui` with every control prop widened to `T \| Signal<T>`; taken in as a signal where the field mounts, so the runtime holds signals only. |
| `FormRenderer` | The `<ngx-formad-form [state] />` component. Pure view — the formFields were created with the state. |

### Author a multi-step wizard

| Symbol | What it is |
| --- | --- |
| `StepperBuilder` | The fluent chain: `withState`, `createForm`, `provide`, `addControlType`/`overrideControlType` (typed: add rejects an existing kind, override requires one), `createStep`, `branch`, `createStepper`, `createRecurrentStepper`, `fork` (terminal) and `build()`. Each method narrows the type (see below). |
| `RecurrentStepperBuilder` | The ring's chain: the same members plus `fold` and the terminal `dock`, whose config carries the flow's `completeWhen`. `createRecurrentStepper` hands one over; `new RecurrentStepperBuilder({ state })` starts a ring at the root. |
| `FormadWizard` | Injectable per stepper — `committed()`, `controller()`, `shared`. Inject it `{ optional: true }` from a slot or custom control to read the wizard's data. |
| `BranchBuilder` | Authors one branch's steps inside `branch(select, { … })`; `step()` and nested `branch()`. |
| `ForkArmBuilder` / `ForkArm` | Authors one fork arm (`withState`/`createForm`/`createStep`/`branch`) ending in `result(...)`. |
| `Stepper<TForms, TCtx, TResult>` | The built linear flow: `{ forms, steps, shared, controlTypes, providers, resolveResult? }`. `RecurrentStepper<TForms, TCtx, C>` is the ring counterpart. |
| `RuntimeStepper` / `RuntimeFlow` | The same with the authoring types erased — what the shell's `[stepper]` input and the controller take. A built `Stepper` is assignable as it is. |
| `CommittedOf<typeof built>` | The typed shape of what a built stepper commits: `{ [step]?: { [poolName]: model } }`. |
| `StepPages` | When a step's pages are built: `Once` (default, at authoring time) or `OnEntry` (again on every entry, over the live context). |
| `ControlKind` | The built-in control kinds as an enum (`ControlKind.Text`, …); `addControlType` refuses to redeclare one. |
| `StepRevisit` / `FormRevisit` | The revisit policies: `StepRevisit.Keep \| Fresh` on a step, `FormRevisit.Keep \| Reseed` on a placement. |
| `DeferTrigger` | `Idle \| Viewport \| Interaction` — the `@defer` trigger a step renders under. |
| `FlowDock` / `FormadDockRestart` / `FormadDockNext` | What a dock component uses: the two-method service, or the `ngxFormadDockRestart` / `ngxFormadDockNext` attributes on its buttons. |
| `StepperComponent` | The `<ngx-formad-stepper [stepper] (completed) (stepCommitted) />` shell — builds the controller, renders the chrome, emits the result on finish and the committed record on each move. |

### Run it yourself (bring-your-own-UI)

| Symbol | What it is |
| --- | --- |
| `StepperController` / `FormadStepperController` | The headless engine and the class that implements it: state signals (`step`, `index`, `canNext`, `progress`, `result`, `committed`, …) + `next`/`back`/`skip`/`goTo`/`reset`/`dockRestart`/`destroy`. |
| `StepPageView` | `<ngx-formad-step-page [step] />` — renders one step's **whole page** (forms + components + rows + content); drop into your own `@defer`. |
| `StepFormsView` | `<ngx-formad-step-forms [step] />` — the forms-only subset of `StepPageView`, for a chrome that never uses `addComponent`. |
| `materializeStep(pages, options)` | Instantiates the forms and page components the pages place, registers the forms and seeds them from the entry context; `MaterializeOptions = { pool, shared, environment, injector?, entry }`. Returns a `LiveStep`. |
| `resolveStepForms(pages, pool)` | Awaits the lazy loaders the pages place into a plain config map (eager ones pass through). |
| `effectiveSteps(steps, ctx)` | The pure conditional filter — the sequence nodes whose `when` passes, in order. |
| `isStepNode` / `isFlowStep` | Narrow a `SequenceNode` to a leaf step or a nested flow slot. |
| `LiveStep` / `LiveForm` | `LiveStep = { registry, forms, components, instances, pages }`; `LiveForm = { name, state, visible, issues, seed(ctx), reseed(ctx), commit(), touch() }`. |
| `InstanceRegistry` | Collects a step's live forms; `completed()` folds `valid()` over the visible ones. |
| `SharedState<S>` | The plain-signal cross-step store: `get(key)`, `select(key)`, `signals()`, `snapshot()`, `patch(partial)`, `reset()`. |
| `StepperProgress` | What `progress()` returns: `levels`, each a `LinearProgressLevel` (rail) or a `RecurrentProgressLevel` (pass bar, dock, folds). |

### Configure the look (call once)

| Symbol | What it is |
| --- | --- |
| `provideFormadSuite(opts?)` | Registers the three adapters. No args = zero-dependency defaults + the bundled chrome. `controlTypes` (a `ControlTypeMap`) layers custom kinds over the base adapter, app-wide. |
| `ControlAdapter` / `LayoutAdapter` | The control and layout axes; `defaultControls` and `cssLayout` are the defaults, `tailwindLayout` the class-emitting alternative. |
| `CONTROL_ADAPTER` / `LAYOUT_ADAPTER` / `STEPPER_ADAPTER` | The three tokens; `DefaultStepperChrome` is the bundled chrome. |
| `GridLayout` / `GridPlacement` / `Responsive<T>` / `responsiveEntries` | The layout specs an adapter resolves, and the helper that unfolds a responsive value. |
| `LayoutItem` | The `[ngxFormadItem]` directive that puts a placement's class and style on the element it sits on; the renderer attaches it to every placed formField. |

### The builder, method by method

Each method moves the type forward — the form pool, the registered control kinds and
the step context are `StepperBuilder`'s three generics, so `addForm`, `bind`, `when`
and `initial` are checked against the exact forms, keys and named steps you declared.
Read each comment as the inferred type *after* the call:

```ts
new StepperBuilder()
//  StepperBuilder<{}, BuiltInControlKind, RootContext>           empty pool, built-in kinds, empty context
  .withState({ slug: '' })
//  StepperBuilder<{}, …, WithShared<RootContext, { slug: string }>>   ctx.shared.slug is a Signal<string>
  .createForm('article', articleForm)
//  StepperBuilder<{ article: FormConfig<Article> }, …>           registers a template; narrows TForms
  .createForm('seo', seoForm)
//  StepperBuilder<{ article: …; seo: FormConfig<Seo> }, …>
  .createStep((step) => step.createPage((page) => page.addForm('article')), { name: 'basics' })
//  …, WithSteps<…, { basics: { article: FormState<Article> } }>>  a NAMED step joins ctx.steps for its successors
  .build();
//  Stepper<{ article: FormConfig<Article>; seo: FormConfig<Seo> }, TCtx, never>
```

So `build()` produces a `Stepper` whose shape is everything the chain accumulated:

```ts
class Stepper<TForms, TCtx, TResult> {
  readonly forms: Record<string, FormConfig | (() => Promise<FormConfig>)>; // the pool: templates by name
  readonly steps: readonly SequenceNode[]; // leaf steps and nested flow slots, the plain tree the runtime walks
  readonly shared: SharedState; // the live cross-step store
  readonly controlTypes: ControlTypeMap; // wizard-scoped custom kinds
  readonly providers: readonly Provider[]; // the flow's own injection environment
  readonly resolveResult?: (ctx) => TResult; // set by fork()
}
```

A built `Stepper` goes straight into `<ngx-formad-stepper [stepper]>`, or you walk
`steps`/`forms`/`shared` yourself with `materializeStep` — the bring-your-own-UI path.
The inner callbacks have small, fixed shapes:

```ts
createStep((step, ctx?) => …, {              // step: StepBuilder; `ctx` only with pages: StepPages.OnEntry
  name?: N,                                   // the key successors read this step under: ctx.steps.<name>
  pages?: StepPages,                          // Once (default) | OnEntry                             // build the pages on every entry, over the live ctx
  label?: string | Signal<string>,            // short name for a chrome's rail (controller.labels())
  when?: (ctx) => boolean,                    // ctx: GateContext — ctx.shared.key() a signal,
  optional?: boolean,                         //   ctx.steps.x?.form a live FormState
  defer?: DeferTrigger,                       // Idle | Viewport | Interaction
  completeWhen?: (ctx) => boolean,            // extra gate ANDed with the form fold; same ctx as `activeWhen`
  incompleteMessage?: string,                 // what `blockers` says when completeWhen is what holds
  revisit?: StepRevisit,                      // Keep (default) | Fresh
})
branch((ctx) => key, {                        // key narrows `branches`; null/undefined selects none
  [key]: (b) => b.createStep((step) => …, opts?)  // b: BranchBuilder — guarded steps; nests via b.branch()
})
fork((ctx) => key, {                          // TERMINAL — only build() after; arms don't rejoin
  [key]: (arm) => arm                         // arm: ForkArmBuilder — its own state/forms/steps
    .createStep((step) => …)
    .result((ctx) => ({ kind: key, … })),     // each arm's result → union into TResult
})
createStepper('name', { build: (sub) => sub…, label?, activeWhen?, defer? })   // a linear flow as ONE step
createRecurrentStepper('name', {              // a ring as ONE step; `loop` ends in dock()
  state: () => C, dockReachable?: (state) => boolean, build: (loop) => loop…, label?, activeWhen?, defer?,
})
loop.dock((step) => …, { name?, label?, dynamic?, defer?, completeWhen?, incompleteMessage? })  // DockCfg: no
//   activeWhen, optional or revisit - the dock is the only way out of the ring
step.createPage((page) => …, { heading?, subheading?, layout?, visibleWhen?: (ctx) => boolean })  // page: PageBuilder; headings take a string or a Signal<string>
page.addForm('name', {                        // a pool name — declared forms only
  componentBindings?: { field: { inputs?: { name: T }, outputs?: { name: (payload, ctx) => … }, bindings?: Binding[] } },
  fieldValueBindings?: (f, s) => [link(f.field, s.sharedKey)],  // field ↔ store slot, both typed, no strings
  visibleWhen?: (ctx) => boolean,             // auto-@if'd by the renderer; the step context, ctx.forms included
  effects?: [(ctx) => …],                     // Angular effects over the step context + the form's own
  initial?: (ctx) => Partial<M>,              // the LOCAL seed, applied once
  revisit?: FormRevisit,                      // Keep (default) | Reseed
})
page.addComponent(Component, {                // inputBinding/outputBinding from @angular/core
  bindings?: Binding[] | ((ctx) => Binding[]),  // an array, or built over the step context when the step is entered
  visibleWhen?: (ctx) => boolean, layout?,
})
page.addContent((c) => …, { layout?, visibleWhen?: (ctx) => boolean })  // prose as data; c: ContentBuilder
//  c.p('Text', { className?, attrs?, on?, visibleWhen? }, (p) => …)   // text, options, children
//  c.div({ className }, (d) => …)   c.ul((list) => …)        // containers: options and/or children
//  c.a('Terms', { href })  c.button('Retry', { on: { click } })  c.img({ src, alt })
//  c.text(() => live())                                     // a bare run at this level
//  c.insert((p) => p.strong('2'), at?).continue(' left')     // into the tag before; cursor stays
page.insertRow((row) => …, { layout?, visibleWhen?: (ctx) => boolean })  // a nested PageBuilder; the gate takes the row's children with it
```

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
| Async `<select>` options (country / region) | A signal as the node's `options` — see [Reactive props](#reactive-props--seed-a-select-after-the-form-exists); set it when the data lands. |
| "Apply promo code" / "look up by SKU" mid-form | A dynamic component slot, `page.addComponent(PromoCard, …)`, that writes into shared/fields. |
| Member-only fields, conditional sections | `visibleWhen` on a field/component, `activeWhen` on a step. |
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
`bind` reaches nested fields through a nested record. All validate natively. See
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
`FormadStepperController`, `materializeStep`, `resolveStepForms`, `effectiveSteps`, the
instance registry — let you build a host from scratch.

**Will a big wizard cause input lag?** It is designed not to — see [Performance](#performance). Nothing builds ahead of time, a keystroke re-evaluates only the gates that read that form, and navigation is one signal write.

## License

[0BSD](./LICENSE) — BSD Zero Clause License. Use it for any purpose, with or without attribution.
