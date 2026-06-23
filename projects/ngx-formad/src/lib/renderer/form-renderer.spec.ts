import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiFormConfigBuilder, email, text } from 'formodel';
import { FormConfig } from '../form-config/form-config';
import { FormRenderer } from './form-renderer';
import { asRenderable, instantiateForm } from './instantiate-form';

type Account = { email: string; name: string };

const accountConfig: FormConfig<Account> = {
  model: () => ({ email: '', name: '' }),
  ui: UiFormConfigBuilder.from({ email: '', name: '' }).email(email('Email')).name(text('Name')),
};

// A host that builds live state in its constructor (an injection context) and
// hands it to the renderer — the intended usage for a static form.
@Component({
  imports: [FormRenderer],
  template: `<ngx-formad-form [state]="state" />`,
})
class Host {
  readonly state = asRenderable(instantiateForm(accountConfig));
}

describe('FormRenderer', () => {
  let fixture: ComponentFixture<Host>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  });

  function inputs(): HTMLInputElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('input'));
  }

  it('renders one control per field with its label', () => {
    expect(inputs().length).toBe(2);
    const labels = Array.from(fixture.nativeElement.querySelectorAll('.ngx-formad-field span')).map(
      (el) => (el as HTMLElement).textContent?.trim(),
    );
    expect(labels).toEqual(['Email', 'Name']);
  });

  it('feeds the native input type through from the node', () => {
    expect(inputs()[0].type).toBe('email');
    expect(inputs()[1].type).toBe('text');
  });

  it('two-way binds: typing updates the field value', async () => {
    const emailInput = inputs()[0];
    emailInput.value = 'alice@example.com';
    emailInput.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    const root = fixture.componentInstance.state.rootForm as any;
    expect(root.email().value()).toBe('alice@example.com');
  });

  it('marks the field dirty on a user edit but not on a programmatic write', async () => {
    const root = fixture.componentInstance.state.rootForm as any;
    expect(root.email().dirty()).toBe(false);

    // A programmatic seed-style write must leave the field pristine, or the
    // shared-state seed gate would refuse to ever re-seed it.
    fixture.componentInstance.state.model.set({ email: 'seed@example.com', name: '' });
    await fixture.whenStable();
    expect(root.email().dirty()).toBe(false);

    // A real user edit must flip dirty so the gate backs off.
    const emailInput = inputs()[0];
    emailInput.value = 'typed@example.com';
    emailInput.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(root.email().dirty()).toBe(true);
  });
});
