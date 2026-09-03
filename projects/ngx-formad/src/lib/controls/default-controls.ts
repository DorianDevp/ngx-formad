import { Component, computed, input, model } from '@angular/core';
import { FormValueControl, ValidationError } from '@angular/forms/signals';
import { ControlOption } from '../form-config/form-config';

type Errors = readonly ValidationError.WithOptionalFieldTree[];

let controlSeq = 0;

function nextControlId(): string {
  controlSeq += 1;

  return `ngxf-${controlSeq}`;
}

const labelText = `{{ label() }}@if (required()) {<span class="ngx-formad-req" aria-hidden="true"> *</span>}`;

const errorLine = `
  @if (touched() && errors().length) {
    <small class="ngx-formad-error" [id]="cid + '-err'" role="alert">{{ errors()[0]?.message }}</small>
  }`;

const ariaAttrs = `
  [attr.aria-invalid]="touched() && errors().length ? 'true' : null"
  [attr.aria-describedby]="touched() && errors().length ? cid + '-err' : null"
  [attr.aria-required]="required() ? 'true' : null"`;

/** The plain-HTML single-line text control; `type` selects the native input type. */
function valueOf(event: Event): string {
  const target = event.target;
  if (target instanceof HTMLInputElement) return target.value;
  if (target instanceof HTMLTextAreaElement) return target.value;

  return target instanceof HTMLSelectElement ? target.value : '';
}

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
  readonly cid = nextControlId();

  value = model('');

  type = input<'text' | 'email' | 'password' | 'tel' | 'url'>('text');

  label = input('');

  placeholder = input('');

  disabled = input(false);

  touched = model(false);

  required = input(false);

  errors = input<Errors>([]);

  asString(e: Event): string {
    return valueOf(e);
  }
}

/** The plain-HTML textarea control. */
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
  readonly cid = nextControlId();

  value = model('');

  label = input('');

  placeholder = input('');

  rows = input(3);

  disabled = input(false);

  touched = model(false);

  required = input(false);

  errors = input<Errors>([]);

  asString(e: Event): string {
    return valueOf(e);
  }
}

/** The plain-HTML number control; an empty box is `null`, not `0`. */
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
  readonly cid = nextControlId();

  value = model<number | null>(null);

  label = input('');

  disabled = input(false);

  touched = model(false);

  required = input(false);

  errors = input<Errors>([]);

  asNumber(e: Event): number | null {
    const raw = valueOf(e);

    return raw === '' ? null : Number(raw);
  }
}

/** The plain-HTML select control; options carry their index as the DOM value so any value type maps back. */
@Component({
  selector: 'ngx-formad-select',
  template: `
    <label class="ngx-formad-field">
      <span>${labelText}</span>
      <select
        [disabled]="disabled()"
        ${ariaAttrs}
        (change)="value.set(optionFrom($event))"
        (blur)="touched.set(true)"
      >
        @if (!matched()) {
          <option value="" selected></option>
        }
        @for (opt of options(); track $index) {
          <option [value]="$index" [selected]="opt.value === value()">{{ opt.label }}</option>
        }
      </select>
      ${errorLine}
    </label>
  `,
})
export class SelectControl implements FormValueControl<ControlOption['value']> {
  readonly cid = nextControlId();

  value = model<ControlOption['value']>(null);

  label = input('');

  options = input<readonly ControlOption[]>([]);

  disabled = input(false);

  touched = model(false);

  required = input(false);

  errors = input<Errors>([]);

  readonly matched = computed(() => this.options().some((option) => option.value === this.value()));

  optionFrom(e: Event): ControlOption['value'] {
    const raw = valueOf(e);
    if (raw === '') return null;

    return this.options()[Number(raw)]?.value ?? null;
  }
}

/** The plain-HTML checkbox control; `innerHTML` renders rich consent prose instead of the label. */
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
      @if (innerHTML()) {
        <span class="ngx-formad-checkbox-label" [innerHTML]="innerHTML()"></span>
      } @else {
        <span>${labelText}</span>
      }
      ${errorLine}
    </label>
  `,
})
export class CheckboxControl implements FormValueControl<boolean> {
  readonly cid = nextControlId();

  value = model(false);

  label = input('');

  innerHTML = input('');

  disabled = input(false);

  touched = model(false);

  required = input(false);

  errors = input<Errors>([]);

  asChecked(e: Event): boolean {
    return e.target instanceof HTMLInputElement && e.target.checked;
  }
}

/** The plain-HTML date control; `minDate`/`maxDate` clamp the native picker. */
@Component({
  selector: 'ngx-formad-date',
  template: `
    <label class="ngx-formad-field">
      <span>${labelText}</span>
      <input
        type="date"
        [value]="inputValue()"
        [disabled]="disabled()"
        [min]="minInputValue()"
        [max]="maxInputValue()"
        ${ariaAttrs}
        (input)="value.set(asDate($event))"
        (blur)="touched.set(true)"
      />
      ${errorLine}
    </label>
  `,
})
export class DateControl implements FormValueControl<Date | null> {
  readonly cid = nextControlId();

  value = model<Date | null>(null);

  label = input('');

  disabled = input(false);

  minDate = input<Date | null>(null);

  maxDate = input<Date | null>(null);

  touched = model(false);

  required = input(false);

  errors = input<Errors>([]);

  readonly inputValue = computed(() => toInputDate(this.value()));

  readonly minInputValue = computed(() => toInputDate(this.minDate()));

  readonly maxInputValue = computed(() => toInputDate(this.maxDate()));

  asDate(e: Event): Date | null {
    const raw = valueOf(e);

    return raw ? new Date(`${raw}T00:00:00`) : null;
  }
}

function toInputDate(date: Date | null): string {
  if (!date) return '';

  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}

/** The plain-HTML file control; `maxFiles` caps the picked list. */
@Component({
  selector: 'ngx-formad-file',
  template: `
    <label class="ngx-formad-field ngx-formad-file">
      <span>${labelText}</span>
      <input
        type="file"
        [accept]="accept()"
        [multiple]="multiple()"
        [disabled]="disabled()"
        ${ariaAttrs}
        (change)="value.set(asFiles($event))"
        (blur)="touched.set(true)"
      />
      @if (value().length) {
        <ul class="ngx-formad-file-list">
          @for (file of value(); track $index) {
            <li>{{ file.name }}</li>
          }
        </ul>
      }
      ${errorLine}
    </label>
  `,
})
export class FileControl implements FormValueControl<readonly File[]> {
  readonly cid = nextControlId();

  value = model<readonly File[]>([]);

  label = input('');

  accept = input('');

  multiple = input(false);

  maxFiles = input<number | null>(null);

  disabled = input(false);

  touched = model(false);

  required = input(false);

  errors = input<Errors>([]);

  asFiles(e: Event): readonly File[] {
    const picked = e.target instanceof HTMLInputElement ? Array.from(e.target.files ?? []) : [];
    const cap = this.maxFiles();

    return cap != null ? picked.slice(0, cap) : picked;
  }
}
