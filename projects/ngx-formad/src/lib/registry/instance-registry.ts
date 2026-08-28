import { computed, signal, Signal } from '@angular/core';
import { FieldTree } from '@angular/forms/signals';

// The builder emits config; `form()` makes live state in the renderer. The
// registry is what bridges the two, and it is signal-backed on purpose: three
// things hang on the same hook — completion reads it, the sync adapter resolves
// peers through it, and the renderer fills it — and all three must react the
// moment a lazily-reached form lands.

/** A live form instance: its native field tree and whether it currently counts. */
export interface FormInstance {
  /** The root of the native field tree, from `form(model, schema)`. */
  readonly rootForm: FieldTree<unknown>;
  /**
   * Whether this instance is visible. Folds `visibleWhen`; a hidden form is
   * excluded from completion so a hidden, required, invalid form can never
   * silently wedge the Next button.
   */
  readonly visible: Signal<boolean>;
}

/** A per-step pool of instances with a reactive completion fold over them. */
export class InstanceRegistry {
  private readonly instances = signal<readonly FormInstance[]>([]);

  /** Registers a freshly instantiated form. */
  add(instance: FormInstance): void {
    this.instances.update((list) => [...list, instance]);
  }

  /** Every registered instance, visible or not. */
  all(): readonly FormInstance[] {
    return this.instances();
  }

  /** Instantiated *and* visible — the only instances completion counts. */
  readonly live = computed(() => this.instances().filter((i) => i.visible()));

  /**
   * True when every live form is valid. A step with no live forms is vacuously
   * complete — the intended "nothing here to fill in" case, not a bug.
   */
  readonly completed = computed(() => this.live().every((i) => i.rootForm().valid()));

  /**
   * True while any live form has a validator still running. `valid()` is false in
   * that state *and* the field reports no errors, so without this a blocked Next
   * has nothing to say - which is the one thing the blocked-Next design promised
   * never to do.
   */
  readonly pending = computed(() => this.live().some((i) => i.rootForm().pending()));
}
