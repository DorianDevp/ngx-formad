import { defineConfig } from 'vitest/config';

// formodel ships ESM with extensionless relative imports. The library build
// bundles it through esbuild, which resolves those fine, but the test runtime
// externalizes node_modules and hands them to a stricter ESM resolver that
// rejects extensionless paths. Inlining formodel routes it through Vite's
// resolver instead, which adds the extensions. The Angular unit-test builder
// merges this config on top of its own.
export default defineConfig({
  test: {
    server: {
      deps: {
        inline: [/formodel/],
      },
    },
  },
});
