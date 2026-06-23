import { Component, input, model } from '@angular/core';
import { FormValueControl, ValidationError } from '@angular/forms/signals';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';

// Angular Material controls for ngx-formad. Each implements the native
// `FormValueControl` contract exactly like the plain-HTML defaults — a two-way
// `value` plus the field-state inputs — so the renderer drives them the same way;
// only the markup is Material.
//
// Material shows errors off its own control's `errorState`, which a signal-forms
// field does not feed. The bridge is a tiny `ErrorStateMatcher` per control that
// reports error state straight from our `touched()` + `errors()` signals, so
// `<mat-error>` lights up exactly when the field is touched and invalid.

type Errors = readonly ValidationError.WithOptionalFieldTree[];

/** An option as the select control consumes it (from the formodel node). */
export interface ControlOption {
  readonly value: unknown;
  readonly label: string;
}

// Reports error state from arbitrary signals rather than a Material/Ng control.
class SignalErrorStateMatcher implements ErrorStateMatcher {
  constructor(private readonly inError: () => boolean) {}
  isErrorState(): boolean {
    return this.inError();
  }
}

@Component({
  selector: 'mat-formad-text',
  imports: [MatFormFieldModule, MatInputModule],
  template: `
    <mat-form-field appearance="outline" class="mat-formad-field">
      <mat-label>{{ label() }}</mat-label>
      <input
        matInput
        [type]="type()"
        [value]="value()"
        [disabled]="disabled()"
        [required]="required()"
        [placeholder]="placeholder()"
        [errorStateMatcher]="matcher"
        (input)="value.set($any($event.target).value)"
        (blur)="touched.set(true)"
      />
      @if (touched() && errors().length) {
        <mat-error>{{ errors()[0]?.message }}</mat-error>
      }
    </mat-form-field>
  `,
})
export class MatTextControl implements FormValueControl<string> {
  value = model('');
  type = input<'text' | 'email' | 'password' | 'tel' | 'url'>('text');
  label = input('');
  placeholder = input('');
  disabled = input(false);
  touched = model(false);
  required = input(false);
  errors = input<Errors>([]);
  protected readonly matcher = new SignalErrorStateMatcher(
    () => this.touched() && this.errors().length > 0,
  );
}

@Component({
  selector: 'mat-formad-textarea',
  imports: [MatFormFieldModule, MatInputModule],
  template: `
    <mat-form-field appearance="outline" class="mat-formad-field">
      <mat-label>{{ label() }}</mat-label>
      <textarea
        matInput
        [value]="value()"
        [disabled]="disabled()"
        [required]="required()"
        [rows]="rows()"
        [placeholder]="placeholder()"
        [errorStateMatcher]="matcher"
        (input)="value.set($any($event.target).value)"
        (blur)="touched.set(true)"
      ></textarea>
      @if (touched() && errors().length) {
        <mat-error>{{ errors()[0]?.message }}</mat-error>
      }
    </mat-form-field>
  `,
})
export class MatTextareaControl implements FormValueControl<string> {
  value = model('');
  label = input('');
  placeholder = input('');
  rows = input(3);
  disabled = input(false);
  touched = model(false);
  required = input(false);
  errors = input<Errors>([]);
  protected readonly matcher = new SignalErrorStateMatcher(
    () => this.touched() && this.errors().length > 0,
  );
}

@Component({
  selector: 'mat-formad-number',
  imports: [MatFormFieldModule, MatInputModule],
  template: `
    <mat-form-field appearance="outline" class="mat-formad-field">
      <mat-label>{{ label() }}</mat-label>
      <input
        matInput
        type="number"
        [value]="value()"
        [disabled]="disabled()"
        [required]="required()"
        [errorStateMatcher]="matcher"
        (input)="value.set(asNumber($event))"
        (blur)="touched.set(true)"
      />
      @if (touched() && errors().length) {
        <mat-error>{{ errors()[0]?.message }}</mat-error>
      }
    </mat-form-field>
  `,
})
export class MatNumberControl implements FormValueControl<number | null> {
  value = model<number | null>(null);
  label = input('');
  disabled = input(false);
  touched = model(false);
  required = input(false);
  errors = input<Errors>([]);
  protected readonly matcher = new SignalErrorStateMatcher(
    () => this.touched() && this.errors().length > 0,
  );
  protected asNumber(e: Event): number | null {
    const raw = (e.target as HTMLInputElement).value;
    return raw === '' ? null : Number(raw);
  }
}

@Component({
  selector: 'mat-formad-select',
  imports: [MatFormFieldModule, MatSelect, MatOption],
  template: `
    <mat-form-field appearance="outline" class="mat-formad-field">
      <mat-label>{{ label() }}</mat-label>
      <mat-select
        [value]="value()"
        [disabled]="disabled()"
        [required]="required()"
        [errorStateMatcher]="matcher"
        (selectionChange)="value.set($event.value)"
        (blur)="touched.set(true)"
      >
        @for (opt of options(); track $index) {
          <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
        }
      </mat-select>
      @if (touched() && errors().length) {
        <mat-error>{{ errors()[0]?.message }}</mat-error>
      }
    </mat-form-field>
  `,
})
export class MatSelectControl implements FormValueControl<unknown> {
  value = model<unknown>(null);
  label = input('');
  options = input<readonly ControlOption[]>([]);
  disabled = input(false);
  touched = model(false);
  required = input(false);
  errors = input<Errors>([]);
  protected readonly matcher = new SignalErrorStateMatcher(
    () => this.touched() && this.errors().length > 0,
  );
}

@Component({
  selector: 'mat-formad-checkbox',
  imports: [MatCheckboxModule],
  template: `
    <mat-checkbox
      [checked]="value()"
      [disabled]="disabled()"
      [required]="required()"
      (change)="value.set($event.checked)"
      (blur)="touched.set(true)"
    >
      {{ label() }}
    </mat-checkbox>
    @if (touched() && errors().length) {
      <small class="mat-formad-error">{{ errors()[0]?.message }}</small>
    }
  `,
})
export class MatCheckboxControl implements FormValueControl<boolean> {
  value = model(false);
  label = input('');
  disabled = input(false);
  touched = model(false);
  required = input(false);
  errors = input<Errors>([]);
}
