# ngx-formad — workspace

This is the Angular workspace for the **ngx-formad** library. The library itself
— including its README, which is the one published to npm — lives in
[`projects/ngx-formad`](./projects/ngx-formad/README.md).

ngx-formad is config-driven rendering and multi-step orchestration for Angular
signal forms: describe a form or wizard as data, and one renderer walks it.

## Working in this repo

```bash
pnpm install        # install dependencies
pnpm test           # run the Vitest suite once
pnpm build          # build the library into dist/ngx-formad
```

`pnpm test` uses the Angular `@angular/build:unit-test` builder on Vitest;
[`vitest.config.ts`](./vitest.config.ts) inlines `formodel` so its ESM resolves
in the test runtime.

## Layout

```
projects/ngx-formad/src/lib/
  layout/      layout adapter + zero-dep CSS-grid default
  controls/    control adapter + zero-dep plain-HTML controls
  form-config/ the formodel-backed field description the renderer consumes
  renderer/    instantiate a form, then draw it (FormRenderer, outlets)
  sync/        cross-step shared state + the directional sync engine
  registry/    the signal-backed instance registry + completion fold
  builders/    the typed StepperBuilder chain and its node tree
  runtime/     materialize a step, and the navigable stepper shell
```

Publishing is done from the build output:

```bash
pnpm build && cd dist/ngx-formad && npm publish
```
