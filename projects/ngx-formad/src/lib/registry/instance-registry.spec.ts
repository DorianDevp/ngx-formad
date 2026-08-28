import { signal, WritableSignal } from '@angular/core';
import { FieldTree } from '@angular/forms/signals';
import { FormInstance, InstanceRegistry } from './instance-registry';

// A minimal stand-in for a live form: just the `valid()` the fold reads, wrapped
// so `rootForm()` returns a field-state-shaped object. The registry never
// touches anything else, so this is enough to exercise the fold.
function fakeInstance(valid: boolean, visible: boolean, pending = false): FormInstance {
  const rootForm = (() => ({
    valid: () => valid,
    pending: () => pending,
  })) as unknown as FieldTree<unknown>;
  return { rootForm, visible: signal(visible) };
}

describe('InstanceRegistry', () => {
  it('counts only visible instances as live', () => {
    const registry = new InstanceRegistry();
    registry.add(fakeInstance(true, true));
    registry.add(fakeInstance(true, false));

    expect(registry.all().length).toBe(2);
    expect(registry.live().length).toBe(1);
  });

  it('is complete only when every live instance is valid', () => {
    const registry = new InstanceRegistry();
    registry.add(fakeInstance(true, true));
    expect(registry.completed()).toBe(true);

    registry.add(fakeInstance(false, true));
    expect(registry.completed()).toBe(false);
  });

  it('reports a live validator still running', () => {
    const registry = new InstanceRegistry();
    // Not valid *and* no errors - the state a blocked Next used to have nothing to
    // say about.
    registry.add(fakeInstance(false, true, true));
    expect(registry.completed()).toBe(false);
    expect(registry.pending()).toBe(true);
  });

  it('ignores a hidden form still validating', () => {
    const registry = new InstanceRegistry();
    registry.add(fakeInstance(true, true));
    registry.add(fakeInstance(false, false, true));

    expect(registry.pending()).toBe(false);
    expect(registry.completed()).toBe(true);
  });

  it('excludes a hidden invalid form from completion', () => {
    const registry = new InstanceRegistry();
    registry.add(fakeInstance(true, true));
    registry.add(fakeInstance(false, false)); // hidden + invalid → ignored

    expect(registry.completed()).toBe(true);
  });

  it('recomputes completion when a later instance lands', () => {
    const registry = new InstanceRegistry();
    const visible: WritableSignal<boolean> = signal(true);
    registry.add(fakeInstance(true, true));
    expect(registry.completed()).toBe(true);

    // A lazily-reached, still-invalid form appears.
    registry.add({
      rootForm: (() => ({ valid: () => false })) as unknown as FieldTree<unknown>,
      visible,
    });
    expect(registry.completed()).toBe(false);

    // Hiding it drops it back out of the fold.
    visible.set(false);
    expect(registry.completed()).toBe(true);
  });

  it('treats a step with no live forms as complete', () => {
    const registry = new InstanceRegistry();
    expect(registry.completed()).toBe(true);
  });
});
