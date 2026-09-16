import { computed, signal, Signal } from '@angular/core';

/** The validity a form reports to the completion fold. */
export interface FormValidity {
  valid(): boolean;

  pending(): boolean;
}

/** A live form instance: a read of its root validity and whether it currently counts. */
export interface FormInstance {
  readonly rootForm: () => FormValidity;

  readonly visible: Signal<boolean>;
}

/** A per-step pool of instances with a reactive completion fold over the visible ones. */
export class InstanceRegistry {
  private readonly instances = signal<readonly FormInstance[]>([]);

  readonly live = computed(() => this.instances().filter((instance) => instance.visible()));

  readonly completed = computed(() => this.live().every((instance) => instance.rootForm().valid()));

  readonly pending = computed(() => this.live().some((instance) => instance.rootForm().pending()));

  add(instance: FormInstance): void {
    this.instances.update((list) => [...list, instance]);
  }

  all(): readonly FormInstance[] {
    return this.instances();
  }
}
