import { Component, effect, input, model, Signal, viewChild } from '@angular/core';
import { FormValueControl, ValidationError } from '@angular/forms/signals';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInput, MatInputModule } from '@angular/material/input';
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

// Material recomputes `errorState` in its own `ngDoCheck`, which our *external*
// `touched`/`errors` signals don't trigger — so the invalid outline would never
// light up. This pokes the Material control's `updateErrorState()` whenever those
// signals change, keeping the red outline in sync with the field's validity. Call
// it from a control's constructor (an injection context).
function syncMatErrorState(
  field: Signal<{ updateErrorState(): void } | undefined>,
  track: () => void,
): void {
  effect(() => {
    track(); // read touched()/errors() so the effect re-runs when they change
    field()?.updateErrorState();
  });
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
  private readonly matInput = viewChild(MatInput);
  constructor() {
    syncMatErrorState(this.matInput, () => {
      this.touched();
      this.errors();
    });
  }
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
  private readonly matInput = viewChild(MatInput);
  constructor() {
    syncMatErrorState(this.matInput, () => {
      this.touched();
      this.errors();
    });
  }
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
  private readonly matInput = viewChild(MatInput);
  constructor() {
    syncMatErrorState(this.matInput, () => {
      this.touched();
      this.errors();
    });
  }
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
  private readonly matSelect = viewChild(MatSelect);
  constructor() {
    syncMatErrorState(this.matSelect, () => {
      this.touched();
      this.errors();
    });
  }
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
      @if (innerHTML()) {
        <!-- Rich consent prose (links included); author-controlled config, not
             user input, so binding it is safe. -->
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
  // `min`/`max` are reserved by the control contract (numeric), so the date
  // bounds use distinct names.
  minDate = input<Date | null>(null);
  maxDate = input<Date | null>(null);
  touched = model(false);
  required = input(false);
  errors = input<Errors>([]);
  protected readonly matcher = new SignalErrorStateMatcher(
    () => this.touched() && this.errors().length > 0,
  );
  private readonly matInput = viewChild(MatInput);
  constructor() {
    syncMatErrorState(this.matInput, () => {
      this.touched();
      this.errors();
    });
  }
}

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

  protected pick(e: Event): void {
    const picked = Array.from((e.target as HTMLInputElement).files ?? []);
    const cap = this.maxFiles();
    this.value.set(cap != null ? picked.slice(0, cap) : picked);
    this.touched.set(true);
  }
}
