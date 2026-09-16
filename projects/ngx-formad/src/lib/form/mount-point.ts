import { Component, inject, InjectionToken, ViewContainerRef } from '@angular/core';
import { ComponentMount } from './types/form-view';

/** The mount a `MountPoint` reads; a row provides its own through the injector it hands `NgComponentOutlet`. */
export const COMPONENT_MOUNT = new InjectionToken<ComponentMount>('ngx-formad.component-mount');

/** Creates the mounted component beside itself as its row comes to life; the component goes when the row goes. */
@Component({
  selector: 'ngx-formad-mount-point',
  host: { style: 'display: contents' },
  template: '',
})
export class MountPoint {
  constructor() {
    const mount = inject(COMPONENT_MOUNT);
    inject(ViewContainerRef).createComponent(mount.component, {
      directives: [...mount.directives],
      bindings: [...mount.bindings],
      environmentInjector: mount.environment,
    });
  }
}
