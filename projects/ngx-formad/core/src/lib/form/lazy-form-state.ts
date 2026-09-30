import { untracked, WritableSignal } from '@angular/core';
import { GridLayout } from '../layout';
import { FieldLevel } from './types/field-tree';
import { FieldConfig } from './types/form-context';
import { FormState } from './types/form-state';
import { FormLevel } from './types/form-view';
import { RenderNode } from './types/render-tree';
import { ErasedUi } from './types/ui-nodes';

/**
 * A form over a model signal of the author's own, built on the first read of anything but `model` and `ui`. The
 * signal may read a required input, which has no value while its component is constructed; the renderer's template
 * reads `view` once the inputs are set. Each getter builds the whole state once, so nothing is built by halves.
 */
export class LazyFormState<M extends Record<string, unknown>, U extends ErasedUi> implements FormState<M, U> {
  private state?: FormState<M, U>;

  constructor(
    readonly model: WritableSignal<M>,
    readonly ui: U,
    private readonly build: () => FormState<M, U>,
  ) {}

  get rootForm(): FieldLevel {
    return this.built().rootForm;
  }

  get nodes(): readonly RenderNode[] {
    return this.built().nodes;
  }

  get fields(): readonly FieldConfig[] {
    return this.built().fields;
  }

  get grid(): GridLayout | undefined {
    return this.built().grid;
  }

  get view(): FormLevel {
    return this.built().view;
  }

  /** Ends the effects of a built state; a state never read has none, and stays unbuilt. */
  destroy(): void {
    this.state?.destroy();
  }

  /** Outside the reader's reactive context: a template is one, and `form()` starts an effect, which may not start there. */
  private built(): FormState<M, U> {
    this.state ??= untracked(this.build);

    return this.state;
  }
}
