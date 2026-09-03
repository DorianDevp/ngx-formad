/** One control output wired to a side effect, its handler already bound to the live form model. */
export interface BoundOutputEffect<P = unknown> {
  readonly path: readonly string[];

  readonly output: string;

  run(payload: P): void;
}

/** Element-wise path equality, for matching a field to its effects. */
export function samePath(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((segment, index) => segment === b[index]);
}
