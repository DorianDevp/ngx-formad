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
import { CONTROL_ADAPTER, LAYOUT_ADAPTER } from '../provide';
import { applyLayoutClasses } from '../layout/layout-adapter';
import {
  FieldConfig,
  FormLayoutContext,
  extraInputsFor,
  resolveControlInput,
} from '../form-config/form-config';
import { readReactive } from '../form-config/reactive';
import { FLOW_ENVIRONMENT } from './flow-environment';
import { BoundOutputEffect, samePath } from './output-effect';

@Directive({ selector: '[ngxFormadField]' })
export class FieldOutlet {
  readonly node = input.required<FieldTree<unknown>>();

  readonly config = input.required<FieldConfig>();

  readonly effects = input<readonly BoundOutputEffect[]>([]);

  readonly context = input.required<FormLayoutContext>();

  private readonly vcr = inject(ViewContainerRef);
  private readonly controls = inject(CONTROL_ADAPTER);
  private readonly layoutAdapter = inject(LAYOUT_ADAPTER);
  private readonly flowEnvironment = inject(FLOW_ENVIRONMENT, { optional: true });

  private ref: ComponentRef<unknown> | null = null;

  constructor() {
    effect(() => {
      const config = this.config();
      untracked(() => {
        this.ref?.destroy();
        this.ref = this.render(config);
      });
    });
  }

  private render(config: FieldConfig): ComponentRef<unknown> | null {
    const control = this.componentFor(config);
    if (!control) return null;

    const bindings = this.presentationalBindings(config);
    for (const effect of this.effects()) {
      if (samePath(effect.path, config.path)) {
        bindings.push(outputBinding(effect.output, (payload: unknown) => effect.run(payload)));
      }
    }

    const ref = this.vcr.createComponent(control, {
      directives: [{ type: FormField, bindings: [inputBinding('formField', () => this.node())] }],
      bindings,
      environmentInjector: this.flowEnvironment?.() ?? undefined,
    });

    const item = this.layoutAdapter.item(config.layout ?? {});
    applyLayoutClasses(ref.location.nativeElement as HTMLElement, item);

    return ref;
  }

  private componentFor(config: FieldConfig): Type<unknown> | null {
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
