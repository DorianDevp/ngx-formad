// The package root is the core and nothing more: `import from 'ngx-formad'` and `from 'ngx-formad/core'` are the same
// thing. The templates are their own entry points (`ngx-formad/template`, `/chrome`, `/tailwind`, `/material`), so an
// application pays only for the ones it imports.
export * from 'ngx-formad/core';
