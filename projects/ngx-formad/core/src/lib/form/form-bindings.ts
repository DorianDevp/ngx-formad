import { BindingRecord } from './types/form-bindings';

function isRecord(value: unknown): value is BindingRecord {
  return typeof value === 'object' && value !== null;
}

/** The entries declared for the field at `path`: the record walked key by key, `{}` where nothing was declared. */
export function bindingsAt(record: BindingRecord, path: readonly string[]): BindingRecord {
  let at: unknown = record;
  for (const key of path) {
    if (!isRecord(at)) return {};

    at = at[key];
  }

  return isRecord(at) ? at : {};
}
