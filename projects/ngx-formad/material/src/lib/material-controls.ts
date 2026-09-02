import { Component, effect, input, model, Signal, viewChild } from '@angular/core';
import { FormValueControl, ValidationError } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInput, MatInputModule } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { ControlOption } from 'ngx-formad';

type Errors = readonly ValidationError.WithOptionalFieldTree[];

class SignalErrorStateMatcher implements ErrorStateMatcher {
  constructor(private readonly inError: () => boolean) {}

  isErrorState(): boolean {
    return this.inError();
  }
}

interface ErrorStateHost {
  updateErrorState(): void;
}

function syncMatErrorState(field: Signal<ErrorStateHost | undefined>, track: () => void): void {
  effect(() => {
    track();
    field()?.updateErrorState();
  });
}

function inputValue(e: Event): string {
  return (e.target as HTMLInputElement).value;
}

/** The Material single-line text control; `type` selects the native input type. */
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
        (input)="value.set(asString($event))"
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

  readonly matcher = new SignalErrorStateMatcher(() => this.touched() && this.errors().length > 0);

  private readonly matInput = viewChild(MatInput);

  constructor() {
    syncMatErrorState(this.matInput, () => {
      this.touched();
      this.errors();
    });
  }

  asString(e: Event): string {
    return inputValue(e);
  }
}

/** The Material textarea control. */
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
        (input)="value.set(asString($event))"
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

  readonly matcher = new SignalErrorStateMatcher(() => this.touched() && this.errors().length > 0);

  private readonly matInput = viewChild(MatInput);

  constructor() {
    syncMatErrorState(this.matInput, () => {
      this.touched();
      this.errors();
    });
  }

  asString(e: Event): string {
    return (e.target as HTMLTextAreaElement).value;
  }
}

/** The Material number control; an empty box is `null`, not `0`. */
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

  readonly matcher = new SignalErrorStateMatcher(() => this.touched() && this.errors().length > 0);

  private readonly matInput = viewChild(MatInput);

  constructor() {
    syncMatErrorState(this.matInput, () => {
      this.touched();
      this.errors();
    });
  }

  asNumber(e: Event): number | null {
    const raw = inputValue(e);

    return raw === '' ? null : Number(raw);
  }
}

/** The Material select control. */
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
export class MatSelectControl implements FormValueControl<ControlOption['value']> {
  value = model<ControlOption['value']>(null);

  label = input('');

  options = input<readonly ControlOption[]>([]);

  disabled = input(false);

  touched = model(false);

  required = input(false);

  errors = input<Errors>([]);

  readonly matcher = new SignalErrorStateMatcher(() => this.touched() && this.errors().length > 0);

  private readonly matSelect = viewChild(MatSelect);

  constructor() {
    syncMatErrorState(this.matSelect, () => {
      this.touched();
      this.errors();
    });
  }
}

/** The Material checkbox control; `innerHTML` renders rich consent prose instead of the label. */
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
      @if (innerHTML()) {
        <span class="mat-formad-checkbox-label" [innerHTML]="innerHTML()"></span>
      } @else {
        {{ label() }}
      }
    </mat-checkbox>
    @if (touched() && errors().length) {
      <small class="mat-formad-error">{{ errors()[0]?.message }}</small>
    }
  `,
})
export class MatCheckboxControl implements FormValueControl<boolean> {
  value = model(false);

  label = input('');

  innerHTML = input('');

  disabled = input(false);

  touched = model(false);

  required = input(false);

  errors = input<Errors>([]);
}

/** The Material date control; `minDate`/`maxDate` bound the picker. */
@Component({
  selector: 'mat-formad-date',
  imports: [MatFormFieldModule, MatInputModule, MatDatepickerModule],
  template: `
    <mat-form-field appearance="outline" class="mat-formad-field">
      <mat-label>{{ label() }}</mat-label>
      <input
        matInput
        [matDatepicker]="picker"
        [value]="value()"
        [disabled]="disabled()"
        [required]="required()"
        [min]="minDate()"
        [max]="maxDate()"
        [errorStateMatcher]="matcher"
        (dateChange)="value.set($event.value)"
        (blur)="touched.set(true)"
      />
      <mat-datepicker-toggle matIconSuffix [for]="picker" />
      <mat-datepicker #picker />
      @if (touched() && errors().length) {
        <mat-error>{{ errors()[0]?.message }}</mat-error>
      }
    </mat-form-field>
  `,
})
export class MatDateControl implements FormValueControl<Date | null> {
  value = model<Date | null>(null);

  label = input('');

  disabled = input(false);

  minDate = input<Date | null>(null);

  maxDate = input<Date | null>(null);

  touched = model(false);

  required = input(false);

  errors = input<Errors>([]);

  readonly matcher = new SignalErrorStateMatcher(() => this.touched() && this.errors().length > 0);

  private readonly matInput = viewChild(MatInput);

  constructor() {
    syncMatErrorState(this.matInput, () => {
      this.touched();
      this.errors();
    });
  }
}

/** The Material file control; `maxFiles` caps the picked list. */
@Component({
  selector: 'mat-formad-file',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="mat-formad-file">
      <button type="button" mat-stroked-button [disabled]="disabled()" (click)="input.click()">
        <mat-icon>attach_file</mat-icon>
        {{ label() || 'Choose file' }}
      </button>
      <input
        #input
        hidden
        type="file"
        [accept]="accept()"
        [multiple]="multiple()"
        (change)="pick($event)"
        (blur)="touched.set(true)"
      />
      @if (value().length) {
        <ul class="mat-formad-file-list">
          @for (file of value(); track $index) {
            <li>{{ file.name }}</li>
          }
        </ul>
      }
      @if (touched() && errors().length) {
        <small class="mat-formad-error">{{ errors()[0]?.message }}</small>
      }
    </div>
  `,
})
export class MatFileControl implements FormValueControl<readonly File[]> {
  value = model<readonly File[]>([]);

  label = input('');

  accept = input('');

  multiple = input(false);

  maxFiles = input<number | null>(null);

  disabled = input(false);

  touched = model(false);

  required = input(false);

  errors = input<Errors>([]);

  pick(e: Event): void {
    const picked = Array.from((e.target as HTMLInputElement).files ?? []);
    const cap = this.maxFiles();
    this.value.set(cap != null ? picked.slice(0, cap) : picked);
    this.touched.set(true);
  }
}
