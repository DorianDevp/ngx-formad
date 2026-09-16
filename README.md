# ngx-formad — workspace

This repository is the Angular **workspace** behind the `ngx-formad` library. It
contains one project:

| Project | Path | What it is |
| --- | --- | --- |
| `ngx-formad` | [`projects/ngx-formad`](./projects/ngx-formad) | The published library. Its [README](./projects/ngx-formad/README.md) is the one shown on npm. |

`ngx-formad` is config-driven rendering and multi-step orchestration on top of
Angular's headless signal forms: describe a form or wizard as data, and one renderer
walks it. It is pre-1.0 (0.10.3) and built on the signal-forms API that is
*experimental* in Angular 21, so expect breaking changes. The full story lives in the
[library README](./projects/ngx-formad/README.md); this file only covers working in
the repo.

## Commands

```bash
pnpm install     # install dependencies
pnpm build       # build the library into dist/ngx-formad
pnpm test        # run the Vitest suite once
pnpm release     # build, then publish dist/ngx-formad
```

**Build before you test.** `tsconfig.json` maps `ngx-formad` and `ngx-formad/material`
to `dist/ngx-formad`, and the Material spec imports through those names, so the suite
compiles against the last build: run `pnpm build` after any change to the public API,
or the spec type-checks against a stale `dist/`.

`pnpm build` is `ng build ngx-formad`, naming the project explicitly. `pnpm test` runs
the Angular `@angular/build:unit-test` builder on Vitest;
[`vitest.config.ts`](./vitest.config.ts) inlines `formodel` so its ESM resolves in the
test runtime.

## Library layout

```
projects/ngx-formad/
  src/lib/
    layout/       layout adapter + zero-dependency CSS-grid default
    controls/     control adapter + zero-dependency plain-HTML controls
    form-config/  the formodel-backed field description the renderer consumes
    renderer/     instantiate a form and describe its view, then draw it (FormRenderer, NodesView, MountPoint)
    sync/         the cross-step shared store (the directional sync itself is in runtime/)
    registry/     the signal-backed instance registry + completion fold
    builders/     the typed StepperBuilder chain and its node tree
    runtime/      materialize a step, and the navigable stepper shell
  material/       optional `ngx-formad/material` entry point (Material control adapter)
```

## Publishing

The package is published from the build output. `ng build` runs ng-packagr, which
copies the README and `LICENSE` into `dist/ngx-formad/`:

```bash
pnpm release                                      # or, by hand:
pnpm build && npm publish ./dist/ngx-formad --access public
```

## License & home

[0BSD](./LICENSE.md) — BSD Zero Clause License. Hosted on
[SourceHut](https://git.sr.ht/~dorian_dev/ngx-formad); issues at the
[tracker](https://todo.sr.ht/~dorian_dev/ngx-formad-tracker).
