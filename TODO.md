# TODO

Roadmap notes for ngx-formad. Ordered by leverage, not effort.

## 0. Decided: serve BOTH audiences from one renderer

No choice needed — the renderer already consumes `ui` as plain data
(`UiFormGroupConfig`), so the same core serves both. The split is only in *how* a
`FormConfig` is produced:

- **(A) TS-devs** — typed builder + `schema` as code. The power/default path; already
  works, keep it.
- **(B) Runtime / JSON** — `ui` from JSON, `model` from a defaults object, validation
  from data (see §1). Same engine, fed JSON.

- [ ] Present them as one story without vagueness: (A) is the default/power path,
  (B) is "the same engine, fed JSON." Don't let "both" dilute into "does everything".

## 1. Enable (B): the JSON path — validation is the keystone

A `FormConfig` has three parts. JSON gets you two for free; the third is the real work.

- `ui` — **already data**; formodel round-trips it to/from JSON. ✅
- `model: () => M` — **data-derivable**: store defaults as JSON, `() => clone(defaults)`. ✅ (tiny adapter)
- `schema: SchemaOrSchemaFn<M>` — **executable signal-forms code**, and it's the
  headline feature ("native validation"). JSON I/O does *not* solve this. ⬇ this is the work.

- [ ] **Validation-as-data** — map built-in rules (required / min / max / minLength /
  maxLength / pattern / email) from JSON to native validators.
- [ ] **Named-validator registry** escape hatch — JSON references a name
  (`{ validator: 'uniqueSlug' }`), code supplies the function. Covers the custom /
  cross-field / async long tail that pure JSON can't express.
- [ ] **Runtime-validate the incoming config** so a bad blob fails loudly, not mid-render.
- [ ] `fromConfig(json)` entry point that assembles the three parts into a `FormConfig`.

## 2. Manufacture proof (the #1 adoption blocker is "who else uses this?")

- [ ] **StackBlitz playground** — edit config, see the form, zero install.
- [ ] A small **docs site** (the README is good but a site lowers the bar further).
- [ ] **One real app** built with it, in public, as the reference.
- [ ] **CI that runs the Angular 21 + 22 smoke test** (we proved it links on 22 once;
  make it continuously true). Pack the lib, build a throwaway 21 app and a 22 app.

## 3. Ecosystem adapters (each is a community on-ramp)

- [ ] **Tailwind** layout adapter (ships as an option; note the safelist gotcha).
- [ ] **PrimeNG** control adapter.
- [ ] Consider whether to re-export formodel's helpers from `ngx-formad` so adopters
  see one import surface (you own both packages — the seam is a packaging choice).

## 3b. SSR & hydration (opened by content blocks, 0.7.0)

Content blocks paint through `Renderer2` from an effect, so they take part in change
detection and *do* appear in server-rendered output - but nothing verifies what
hydration makes of imperatively created children under an empty-template component.
FormFields and page components are created by a `MountPoint` component's constructor
through `ViewContainerRef.createComponent` as their row appears; they render on the
server too, but nothing verifies hydration of that path yet.

- [ ] An SSR + hydration smoke test (prerender a wizard step with `addContent`, then
  hydrate) - decide whether content adopts the server DOM or has to be reclaimed.
- [ ] Document the outcome; until then the README calls SSR + hydration untested.
- [ ] Revisit the `Renderer2` choice if hydration needs template-owned nodes: the
  reason for it is `ul > li` nesting, and a recursive `ng-template` + `ngTemplateOutlet`
  would keep the DOM flat at the cost of one `@switch` case per tag.

## 4. Trust & release hygiene

- [ ] Stated **Angular compatibility policy** (build against the floor, support up to
  the ceiling; currently 21.2+ / 22).
- [ ] **CHANGELOG.md** + strict semver discipline.
- [ ] Tag releases (e.g. `v0.1.0`) on the published history.

## 5. Housekeeping (found while shipping 0.1.0)

- [ ] **Harden `.gitignore`** — it ignores `/node_modules` (root only), not nested
  ones. A stray `pnpm install` inside `projects/ngx-formad/` created a nested
  Angular 22 install that collided with root Angular 21 and broke the build. Add
  `**/node_modules/` and `projects/*/pnpm-lock.yaml` (or similar) so it can't recur.
- [ ] Document the publish flow in one place: `pnpm build && cd dist/ngx-formad &&
  npm publish` (always rebuild first — never publish a stale `dist/`).
- [ ] **Reconcile the repeating-arrays docs with the code.** `form-config.ts` says
  array rendering "is not built yet — the node is recognized and skipped," but the
  README documents Add/Remove repeaters as working. Either finish array rendering or
  correct the README — right now it over-promises.
