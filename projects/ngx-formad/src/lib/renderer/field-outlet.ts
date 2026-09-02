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
import { FieldTree, FormField } from '@angular/forms/signals';
import { CUSTOM_FIELD } from 'formodel';
import { ErasedValue } from '../builders/step-context';
import {
  FieldConfig,
  FormLayoutContext,
  extraInputsFor,
  resolveControlInput,
} from '../form-config/form-config';
import { readReactive } from '../form-config/reactive';
import { applyLayoutClasses } from '../layout/layout-adapter';
import { CONTROL_ADAPTER, LAYOUT_ADAPTER } from '../provide';
import { FLOW_ENVIRONMENT } from './flow-environment';
import { BoundOutputEffect, samePath } from './output-effect';

/** Mounts one field's control as the grid item itself, bound through `FormField` plus the node's presentational inputs. */
@Directive({ selector: '[ngxFormadField]' })
export class FieldOutlet {
  readonly node = input.required<FieldTree<ErasedValue>>();

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
      .map((effect) => outputBinding(effect.output, (payload: ErasedValue) => effect.run(payload)));
    const ref = this.vcr.createComponent(control, {
      directives: [{ type: FormField, bindings: [inputBinding('formField', () => this.node())] }],
      bindings: [...this.presentationalBindings(config), ...effects],
      environmentInjector: this.flowEnvironment?.() ?? undefined,
    });
    applyLayoutClasses(ref.location.nativeElement as HTMLElement, this.layoutAdapter.item(config.layout ?? {}));

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
      return Object.entries(config.control.inputs).map(([name, value]) =>
        inputBinding(name, () => resolveControlInput(value, this.context())),
      );
    }

    return Object.entries(extraInputsFor(config.node)).map(([name, value]) =>
      inputBinding(name, () => readReactive(value)),
    );
  }
}
