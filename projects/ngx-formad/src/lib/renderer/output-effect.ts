import { ErasedValue } from '../builders/step-context';

/** One control output wired to a side effect, its handler already bound to the live form model. */
export interface BoundOutputEffect {
  readonly path: readonly string[];

  readonly output: string;

  readonly run: (payload: ErasedValue) => void;
}

/** Element-wise path equality, for matching a field to its effects. */
export function samePath(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((segment, index) => segment === b[index]);
}
