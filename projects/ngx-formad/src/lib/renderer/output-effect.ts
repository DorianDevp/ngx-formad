// One control output wired to a side effect, with its handler already bound to the
// live form model. It rides from `materializeStep` down through the renderer to the
// `FieldOutlet`, which attaches an `outputBinding` for the matching field. The
// authoring shape (`OutputEffect` in shared-link) records the model path + handler;
// this is the runtime form, where `run` closes over `state.model`.
export interface BoundOutputEffect {
  /** The path of the field whose control emits the output. */
  readonly path: readonly string[];
  /** The control output's public name. */
  readonly output: string;
  /** Runs the recorded handler with the emitted payload (and the bound model). */
  readonly run: (payload: unknown) => void;
}

/** Element-wise path equality, for matching a field to its effects. */
export function samePath(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((seg, i) => seg === b[i]);
}
