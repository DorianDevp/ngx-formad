import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { required } from '@angular/forms/signals';
import { UiFormConfigBuilder, select, text } from 'formodel';
import { FormConfig, FormRenderer, instantiateForm, provideFormadSuite } from 'ngx-formad';
import { materialControls } from 'ngx-formad/material';

// Field-behaviour coverage for the Material adapter — the thing a form library
// must actually verify: the control renders, two-way binds, lights its invalid
// outline when touched-and-invalid, and does so without burying every field in
// wrapper elements.

async function pump(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

type Model = { name: string; role: string };
const config: FormConfig<Model> = {
  model: () => ({ name: '', role: '' }),
  ui: UiFormConfigBuilder.from({ name: '', role: '' })
    .name(text('Name'))
    .role(select('Role', [{ value: 'admin', description: 'Admin' }, { value: 'user', description: 'User' }])),
  schema: (p) => required(p.name, { message: 'Required' }),
};

@Component({
  imports: [FormRenderer],
  template: `<ngx-formad-form [state]="state" />`,
})
class Host {
  readonly state = instantiateForm(config);
}

describe('Material adapter — field behaviour', () => {
  let fixture: ComponentFixture<Host>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideFormadSuite({ controls: materialControls })],
    });
    fixture = TestBed.createComponent(Host);
    await pump(fixture);
  });

  const el = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement | null;

  it('renders Material controls (mat-form-field + the mapped control)', () => {
    expect(el('mat-form-field')).toBeTruthy();
    expect(el('mat-formad-text')).toBeTruthy();
    expect(el('mat-formad-select')).toBeTruthy();
  });

  it('two-way binds: typing updates the field value', async () => {
    const input = el('input') as HTMLInputElement;
    input.value = 'Ada';
    input.dispatchEvent(new Event('input'));
    await pump(fixture);

    expect(fixture.componentInstance.state.rootForm.name().value()).toBe('Ada');
  });

  it('shows the invalid outline once a required field is touched and empty', async () => {
    const field = el('mat-form-field')!;
    // Pristine + untouched → not invalid yet.
    expect(field.classList.contains('mat-form-field-invalid')).toBe(false);

    // Touch it (blur) while empty → required error → red outline.
    (el('input') as HTMLInputElement).dispatchEvent(new Event('blur'));
    await pump(fixture);

    expect(field.classList.contains('mat-form-field-invalid')).toBe(true);
    expect(el('mat-error')?.textContent?.trim()).toBe('Required');
  });

  it('keeps the DOM flat — no field-outlet host, no per-field wrapper div', () => {
    // The directive renders the control as the grid item itself.
    expect(fixture.nativeElement.querySelector('ngx-formad-field-outlet')).toBeNull();
    // The control host sits directly inside the grid container.
    const control = el('mat-formad-text')!;
    const parent = control.parentElement as HTMLElement;
    expect(parent.style.display).toBe('grid');
  });
});
