import { Component, computed, inject, input } from '@angular/core';
import { FieldTree } from '@angular/forms/signals';
import { LAYOUT_ADAPTER } from '../provide';
import { LayoutSpec } from '../layout/layout-adapter';
import { FieldConfig } from '../form-config/form-config';
import { FormState } from './instantiate-form';
import { FieldOutlet } from './field-outlet';

// Walks one form's field list and draws a control per field, arranged by the
// layout adapter. It takes already-live state, never a raw config, so it does no
// `form()` call and needs no injection-context tricks — it is a pure view over a
// tree someone else instantiated.
@Component({
  selector: 'ngx-formad-form',
  imports: [FieldOutlet],
  template: `
    <div [class]="containerClass()" [style]="containerStyle()">
      @for (field of fields(); track field.key) {
        <div [class]="itemClass(field)" [style]="itemStyle(field)">
          <ngx-formad-field-outlet [node]="nodeFor(field)" [config]="field" />
        </div>
      }
    </div>
  `,
})
export class FormRenderer {
  /** The live form state, from `instantiateForm(config)`. */
  readonly state = input.required<FormState<Record<string, unknown>>>();
  /** How the fields are arranged; resolved through the layout adapter. */
  readonly layout = input<LayoutSpec>({});

  private readonly layoutAdapter = inject(LAYOUT_ADAPTER);

  protected readonly fields = computed(() => this.state().fields);

  // Each top-level key resolves to its child field tree node by indexing the
  // root — the same `root.email` navigation native templates use, done by key.
  protected nodeFor(field: FieldConfig): FieldTree<unknown> {
    const root = this.state().rootForm as Record<string, FieldTree<unknown>>;
    return root[field.key];
  }

  private readonly container = computed(() => this.layoutAdapter.container(this.layout()));
  protected readonly containerClass = computed(() => this.container().class ?? '');
  protected readonly containerStyle = computed(() => this.container().style ?? {});

  protected itemClass(field: FieldConfig): string {
    return this.layoutAdapter.item(field.layout ?? {}).class ?? '';
  }

  protected itemStyle(field: FieldConfig): Record<string, string> {
    return this.layoutAdapter.item(field.layout ?? {}).style ?? {};
  }
}
