# ngx-formad — workspace

This repository is the Angular **workspace** (monorepo) behind the `ngx-formad`
library. It contains two projects:

| Project | Path | What it is |
| --- | --- | --- |
| `ngx-formad` | [`projects/ngx-formad`](./projects/ngx-formad) | The published library. Its [README](./projects/ngx-formad/README.md) is the one shown on npm. |
| `examples` | [`projects/examples`](./projects/examples) | A runnable demo app — a storefront self-service portal — that exercises the library end to end. |

`ngx-formad` is config-driven rendering and multi-step orchestration on top of
Angular's headless signal forms: describe a form or wizard as data, and one renderer
walks it. It is an early release (0.1.x) built on the signal-forms API that is
*experimental* in Angular 21, so expect breaking changes. The full story lives in the
[library README](./projects/ngx-formad/README.md); this file only covers working in
the repo.

## Commands

```bash
pnpm install     # install dependencies
pnpm test        # run the Vitest suite once
pnpm build       # build the library into dist/ngx-formad
pnpm examples    # build the library, then serve the demo app
```

`pnpm build` and `pnpm examples` name the `ngx-formad` project explicitly — the
workspace has more than one project, so a bare `ng build` is ambiguous. `pnpm test`
runs the Angular `@angular/build:unit-test` builder on Vitest;
[`vitest.config.ts`](./vitest.config.ts) inlines `formodel` so its ESM resolves in the
test runtime.

## Library layout

```
projects/ngx-formad/
  src/lib/
    layout/       layout adapter + zero-dependency CSS-grid default
    controls/     control adapter + zero-dependency plain-HTML controls
    form-config/  the formodel-backed field description the renderer consumes
    renderer/     instantiate a form, then draw it (FormRenderer, outlets)
    sync/         cross-step shared state + the directional sync engine
    registry/     the signal-backed instance registry + completion fold
    builders/     the typed StepperBuilder chain and its node tree
    runtime/      materialize a step, and the navigable stepper shell
  material/       optional `ngx-formad/material` entry point (Material control adapter)
```

## Publishing

The package is published from the build output. `ng build` runs ng-packagr, which
copies the README and `LICENSE` into `dist/ngx-formad/`:

```bash
pnpm build && cd dist/ngx-formad && npm publish
```

## License & home

[0BSD](./LICENSE.md) — BSD Zero Clause License. Hosted on
[SourceHut](https://git.sr.ht/~dorian_dev/ngx-formad); issues at the
[tracker](https://todo.sr.ht/~dorian_dev/ngx-formad-tracker).
