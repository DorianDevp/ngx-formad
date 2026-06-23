import { Component, input, model } from '@angular/core';
import { FormValueControl, ValidationError } from '@angular/forms/signals';

// The plain-HTML controls. Each implements the native `FormValueControl`
// contract and nothing more: a two-way `value`, the field-state inputs it cares
// to show, and a single error line. They are intentionally unstyled — this is
// the funnel's entry point, the "ugly but working, zero deps" tier. A prettier
// tier (Material, PrimeNG) is a different adapter, not a change here.
//
// Accessibility is built in: the `<label>` wraps the control (so the label is
// associated without a `for`/`id` dance), and on error the control gets
// `aria-invalid` + `aria-describedby` pointing at an `role="alert"` message, with
// `aria-required` mirrored from the field. Each control owns a unique id so the
// description link is unambiguous even with many controls on a page.

type Errors = readonly ValidationError.WithOptionalFieldTree[];

// Per-instance id for the aria-describedby link between control and error text.
let controlSeq = 0;
function nextControlId(): string {
  return `ngxf-${++controlSeq}`;
}

// Shared label markup: the visible label plus a required marker (decorative —
// `aria-required` on the control carries the semantics).
const labelText = `{{ label() }}@if (required()) {<span class="ngx-formad-req" aria-hidden="true"> *</span>}`;

// Shared error line: an alerting, addressable message shown once touched.
const errorLine = `
  @if (touched() && errors().length) {
    <small class="ngx-formad-error" [id]="cid + '-err'" role="alert">{{ errors()[0]?.message }}</small>
  }`;

// The aria attributes a control mirrors from its field state.
const ariaAttrs = `
  [attr.aria-invalid]="touched() && errors().length ? 'true' : null"
  [attr.aria-describedby]="touched() && errors().length ? cid + '-err' : null"
  [attr.aria-required]="required() ? 'true' : null"`;

@Component({
  selector: 'ngx-formad-text',
  template: `
    <label class="ngx-formad-field">
      <span>${labelText}</span>
      <input
        [type]="type()"
        [value]="value()"
        [disabled]="disabled()"
        [placeholder]="placeholder()"
        ${ariaAttrs}
        (input)="value.set(asString($event))"
        (blur)="touched.set(true)"
      />
      ${errorLine}
    </label>
  `,
})
export class TextControl implements FormValueControl<string> {
  protected readonly cid = nextControlId();
  value = model('');
  // One component backs every single-line text kind; the kind only changes the
  // native input `type`, which the renderer passes through.
  type = input<'text' | 'email' | 'password' | 'tel' | 'url'>('text');
  label = input('');
  placeholder = input('');
  disabled = input(false);
  touched = model(false);
  required = input(false);
  errors = input<Errors>([]);

  protected asString(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}

@Component({
  selector: 'ngx-formad-textarea',
  template: `
    <label class="ngx-formad-field">
      <span>${labelText}</span>
      <textarea
        [value]="value()"
        [disabled]="disabled()"
        [rows]="rows()"
        [placeholder]="placeholder()"
        ${ariaAttrs}
        (input)="value.set(asString($event))"
        (blur)="touched.set(true)"
      ></textarea>
      ${errorLine}
    </label>
  `,
})
export class TextareaControl implements FormValueControl<string> {
  protected readonly cid = nextControlId();
  value = model('');
  label = input('');
  placeholder = input('');
  rows = input(3);
  disabled = input(false);
  touched = model(false);
  required = input(false);
  errors = input<Errors>([]);

  protected asString(e: Event): string {
    return (e.target as HTMLTextAreaElement).value;
  }
}

@Component({
  selector: 'ngx-formad-number',
  template: `
    <label class="ngx-formad-field">
      <span>${labelText}</span>
      <input
        type="number"
        [value]="value()"
        [disabled]="disabled()"
        ${ariaAttrs}
        (input)="value.set(asNumber($event))"
        (blur)="touched.set(true)"
      />
      ${errorLine}
    </label>
  `,
})
export class NumberControl implements FormValueControl<number | null> {
  protected readonly cid = nextControlId();
  value = model<number | null>(null);
  label = input('');
  disabled = input(false);
  touched = model(false);
  required = input(false);
  errors = input<Errors>([]);

  // An empty box is `null`, not `0` — they mean different things to a validator.
  protected asNumber(e: Event): number | null {
    const raw = (e.target as HTMLInputElement).value;
    return raw === '' ? null : Number(raw);
  }
}

/** An option as the select/radio controls consume it. */
export interface ControlOption {
  readonly value: unknown;
  readonly label: string;
}

@Component({
  selector: 'ngx-formad-select',
  template: `
    <label class="ngx-formad-field">
      <span>${labelText}</span>
      <select
        [disabled]="disabled()"
        ${ariaAttrs}
        (change)="value.set(optionAt($event))"
        (blur)="touched.set(true)"
      >
        @for (opt of options(); track $index) {
          <option [selected]="opt.value === value()">{{ opt.label }}</option>
        }
      </select>
      ${errorLine}
    </label>
  `,
})
export class SelectControl implements FormValueControl<unknown> {
  protected readonly cid = nextControlId();
  value = model<unknown>(null);
  label = input('');
  // Options ride alongside the contract — the renderer feeds them from the node.
  options = input<readonly ControlOption[]>([]);
  disabled = input(false);
  touched = model(false);
  required = input(false);
  errors = input<Errors>([]);

  // The <option> elements carry no value attribute, so map the selected index
  // back to the original (possibly non-string) option value.
  protected optionAt(e: Event): unknown {
    const index = (e.target as HTMLSelectElement).selectedIndex;
    return this.options()[index]?.value ?? null;
  }
}

@Component({
  selector: 'ngx-formad-checkbox',
  template: `
    <label class="ngx-formad-field ngx-formad-checkbox">
      <input
        type="checkbox"
        [checked]="value()"
        [disabled]="disabled()"
        ${ariaAttrs}
        (change)="value.set(asChecked($event))"
        (blur)="touched.set(true)"
      />
      <span>${labelText}</span>
      ${errorLine}
    </label>
  `,
})
export class CheckboxControl implements FormValueControl<boolean> {
  protected readonly cid = nextControlId();
  value = model(false);
  label = input('');
  disabled = input(false);
  touched = model(false);
  required = input(false);
  errors = input<Errors>([]);

  protected asChecked(e: Event): boolean {
    return (e.target as HTMLInputElement).checked;
  }
}
