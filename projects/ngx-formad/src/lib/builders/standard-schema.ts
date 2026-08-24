// The Standard Schema v1 contract (https://standardschema.dev) — the neutral
// validation interface zod 4, valibot, and arktype all implement, and the same
// contract `@angular/forms/signals` validates against natively. Vendored as
// types, per the spec's own guidance, so accepting a schema adds no dependency:
// these interfaces are structural, so any spec-compliant schema just assigns.

/** A schema implementing Standard Schema v1 — pass a zod 4 / valibot / arktype
 *  schema wherever this is accepted. */
export interface StandardSchema<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaProps<Input, Output>;
}

/** A Standard Schema whose parsed output is `T`. Input is left open on purpose:
 *  a schema with defaults or coercion has a wider input than its output, and the
 *  suite only ever cares what comes out. */
export type StandardSchemaOf<T> = StandardSchema<unknown, T>;

/** The `~standard` property bag. */
export interface StandardSchemaProps<Input = unknown, Output = Input> {
  readonly version: 1;
  readonly vendor: string;
  readonly validate: (
    value: unknown,
  ) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
  /** Phantom carrier of the schema's inferred types; never read at runtime. */
  readonly types?: { readonly input: Input; readonly output: Output } | undefined;
}

/** A validation outcome: a typed value on success, issues on failure. */
export type StandardSchemaResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: readonly StandardSchemaIssue[] };

/** One failed-validation issue. */
export interface StandardSchemaIssue {
  readonly message: string;
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[] | undefined;
}
