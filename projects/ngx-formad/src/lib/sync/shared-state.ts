import { signal, Signal, WritableSignal } from '@angular/core';

/** The cross-step shared store: one writable signal per key, read through `select`, `get` and `signals`. */
export class SharedState<T extends Record<string, unknown> = Record<string, unknown>> {
  private readonly cells = new Map<string, WritableSignal<T[string]>>();

  private readonly initial: T;

  constructor(initial: T) {
    this.initial = structuredClone(initial);
    for (const key in initial) this.cells.set(key, signal(structuredClone(initial[key])));
  }

  reset(): void {
    const fresh = structuredClone(this.initial);
    for (const key in fresh) this.cell(key).set(fresh[key]);
  }

  select(key: string): Signal<T[string]> {
    return this.cell(key).asReadonly();
  }

  get(key: string): T[string] {
    return this.cell(key)();
  }

  signals(): Readonly<Record<string, Signal<T[string]>>> {
    const view: Record<string, Signal<T[string]>> = {};
    for (const [key, cell] of this.cells) view[key] = cell.asReadonly();

    return view;
  }

  snapshot(): Readonly<Record<string, T[string]>> {
    const values: Record<string, T[string]> = {};
    for (const [key, cell] of this.cells) values[key] = cell();

    return values;
  }

  patch(partial: Partial<T>): void {
    for (const key in partial) {
      const value = partial[key];
      if (value !== undefined) this.cell(key).set(value);
    }
  }

  private cell(key: string): WritableSignal<T[string]> {
    const cell = this.cells.get(key);
    if (!cell) throw new Error(`ngx-formad: shared state has no key "${key}".`);

    return cell;
  }
}
