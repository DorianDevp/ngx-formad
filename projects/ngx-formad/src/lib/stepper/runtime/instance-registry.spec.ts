import { signal, WritableSignal } from '@angular/core';
import { FormInstance, InstanceRegistry } from './instance-registry';

interface Fake {
  readonly valid: boolean;
  readonly visible: boolean;
  readonly pending?: boolean;
}

function fakeInstance(fake: Fake): FormInstance {
  return {
    rootForm: () => ({ valid: () => fake.valid, pending: () => fake.pending ?? false }),
    visible: signal(fake.visible),
  };
}

describe('InstanceRegistry', () => {
  it('counts only visible instances as live', () => {
    const registry = new InstanceRegistry();
    registry.add(fakeInstance({ valid: true, visible: true }));
    registry.add(fakeInstance({ valid: true, visible: false }));

    expect(registry.all().length).toBe(2);
    expect(registry.live().length).toBe(1);
  });

  it('is complete only when every live instance is valid', () => {
    const registry = new InstanceRegistry();
    registry.add(fakeInstance({ valid: true, visible: true }));
    expect(registry.completed()).toBe(true);

    registry.add(fakeInstance({ valid: false, visible: true }));
    expect(registry.completed()).toBe(false);
  });

  it('reports a live validator still running', () => {
    const registry = new InstanceRegistry();
    registry.add(fakeInstance({ valid: false, visible: true, pending: true }));

    expect(registry.completed()).toBe(false);
    expect(registry.pending()).toBe(true);
  });

  it('ignores a hidden form still validating', () => {
    const registry = new InstanceRegistry();
    registry.add(fakeInstance({ valid: true, visible: true }));
    registry.add(fakeInstance({ valid: false, visible: false, pending: true }));

    expect(registry.pending()).toBe(false);
    expect(registry.completed()).toBe(true);
  });

  it('excludes a hidden invalid form from completion', () => {
    const registry = new InstanceRegistry();
    registry.add(fakeInstance({ valid: true, visible: true }));
    registry.add(fakeInstance({ valid: false, visible: false }));

    expect(registry.completed()).toBe(true);
  });

  it('recomputes completion when a later instance lands', () => {
    const registry = new InstanceRegistry();
    const visible: WritableSignal<boolean> = signal(true);
    registry.add(fakeInstance({ valid: true, visible: true }));
    expect(registry.completed()).toBe(true);

    registry.add({ rootForm: () => ({ valid: () => false, pending: () => false }), visible });
    expect(registry.completed()).toBe(false);

    visible.set(false);
    expect(registry.completed()).toBe(true);
  });

  it('treats a step with no live forms as complete', () => {
    const registry = new InstanceRegistry();
    expect(registry.completed()).toBe(true);
  });
});
