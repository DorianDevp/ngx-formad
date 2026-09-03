import {
  Binding,
  ComponentRef,
  Directive,
  effect,
  inject,
  input,
  inputBinding,
  outputBinding,
  Type,
  untracked,
  ViewContainerRef,
} from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { CUSTOM_FIELD, isGetter } from 'formodel';
import { FieldConfig, FormLayoutContext, extraInputsFor } from '../form-config/form-config';
import { FieldLeaf } from './instantiate-form';
import { applyLayoutClasses } from '../layout/layout-adapter';
import { CONTROL_ADAPTER, LAYOUT_ADAPTER } from '../provide';
import { FLOW_ENVIRONMENT } from './flow-environment';
import { BoundOutputEffect, samePath } from './output-effect';

/** Mounts one field's control as the grid item itself, bound through `FormField` plus the node's presentational inputs. */
@Directive({ selector: '[ngxFormadField]' })
export class FieldOutlet {
  readonly node = input.required<FieldLeaf>();

  readonly config = input.required<FieldConfig>();

  readonly effects = input<readonly BoundOutputEffect[]>([]);

  readonly context = input.required<FormLayoutContext>();

  private readonly vcr = inject(ViewContainerRef);

  private readonly controls = inject(CONTROL_ADAPTER);

  private readonly layoutAdapter = inject(LAYOUT_ADAPTER);

  private readonly flowEnvironment = inject(FLOW_ENVIRONMENT, { optional: true });

  private ref: ComponentRef<object> | null = null;

  constructor() {
    effect(() => {
      const config = this.config();
      untracked(() => {
        this.ref?.destroy();
        this.ref = this.render(config);
      });
    });
  }

  private render(config: FieldConfig): ComponentRef<object> | null {
    const control = this.componentFor(config);
    if (!control) return null;

    const effects = this.effects()
      .filter((effect) => samePath(effect.path, config.path))
      .map((effect) => outputBinding(effect.output, (payload) => effect.run(payload)));
    const ref = this.vcr.createComponent(control, {
      directives: [{ type: FormField, bindings: [inputBinding('formField', () => this.node())] }],
      bindings: [...this.presentationalBindings(config), ...effects],
      environmentInjector: this.flowEnvironment?.() ?? undefined,
    });
    const host: HTMLElement = ref.location.nativeElement;
    applyLayoutClasses(host, this.layoutAdapter.item(config.layout ?? {}));

    return ref;
  }

  private componentFor(config: FieldConfig): Type<object> | null {
    if (config.control) return config.control.component;
    if (config.node.type === CUSTOM_FIELD) {
      throw new Error(
        `ngx-formad: field "${config.key}" is a customField(); place it with formLayout().control(key, Component).`,
      );
    }

    return this.controls.controlFor(config.node.type) ?? this.controls.controlFor('text');
  }

  private presentationalBindings(config: FieldConfig): Binding[] {
    if (config.control) {
      return Object.entries(config.control.inputs).map(([name, input]) =>
        inputBinding(name, () => input.read(this.context())),
      );
    }

    return Object.entries(extraInputsFor(config.node)).map(([name, value]) =>
      inputBinding(name, () => (isGetter(value) ? value() : value)),
    );
  }
}
