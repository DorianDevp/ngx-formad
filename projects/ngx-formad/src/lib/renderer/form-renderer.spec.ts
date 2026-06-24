import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FieldTree, hidden } from '@angular/forms/signals';
import { array, UiFormConfigBuilder, email, text, select } from 'formodel';
import { FormConfig } from '../form-config/form-config';
import { FormRenderer } from './form-renderer';
import { asRenderable, instantiateForm } from './instantiate-form';

async function pump(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

type Account = { email: string; name: string; type: '' };

const accountConfig: FormConfig<Account> = {
  model: () => ({ email: '', name: '', type: '' }),
  ui: UiFormConfigBuilder.from({ email: '', name: '', type: '' })
    .email(email('Email'))
    .name(text('Name'))
    .type(select('Type', [ { value: 'Admin', description: '' }, { value: 'User', description: '' } ])),
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
    // Email and Name are <input>s; Type is the <select> — all three carry a label.
    expect(labels).toEqual(['Email', 'Name', 'Type']);
  });

  it('renders a select control with its options', () => {
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.querySelectorAll('option').length).toBe(2);
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

    const root = fixture.componentInstance.state.rootForm as unknown as Record<
      string,
      FieldTree<unknown>
    >;
    expect(root['email']().value()).toBe('alice@example.com');
  });

  it('marks the field dirty on a user edit but not on a programmatic write', async () => {
    const root = fixture.componentInstance.state.rootForm as unknown as Record<
      string,
      FieldTree<unknown>
    >;
    expect(root['email']().dirty()).toBe(false);

    // A programmatic seed-style write must leave the field pristine, or the
    // shared-state seed gate would refuse to ever re-seed it.
    fixture.componentInstance.state.model.set({ email: 'seed@example.com', name: '', type: '' });
    await fixture.whenStable();
    expect(root['email']().dirty()).toBe(false);

    // A real user edit must flip dirty so the gate backs off.
    const emailInput = inputs()[0];
    emailInput.value = 'typed@example.com';
    emailInput.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(root['email']().dirty()).toBe(true);
  });
});

type Nested = { name: string; address: { city: string; street: string } };
const nestedConfig: FormConfig<Nested> = {
  model: () => ({ name: '', address: { city: '', street: '' } }),
  ui: UiFormConfigBuilder.from({ name: '', address: { city: '', street: '' } })
    .name(text('Name'))
    .address({ label: 'Address', maxCols: 2 }, (b) =>
      b.city(text('City')).street(text('Street')),
    ),
};

@Component({
  imports: [FormRenderer],
  template: `<ngx-formad-form [state]="state" />`,
})
class NestedHost {
  readonly state = asRenderable(instantiateForm(nestedConfig));
}

describe('FormRenderer — nested groups', () => {
  let fixture: ComponentFixture<NestedHost>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(NestedHost);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('renders the group as a fieldset with its nested controls', () => {
    const fieldset = fixture.nativeElement.querySelector('fieldset.ngx-formad-group');
    expect(fieldset).toBeTruthy();
    expect(fieldset.querySelector('.ngx-formad-group-label')?.textContent?.trim()).toBe('Address');

    const labels = Array.from(fixture.nativeElement.querySelectorAll('.ngx-formad-field span')).map(
      (el) => (el as HTMLElement).textContent?.trim(),
    );
    expect(labels).toEqual(['Name', 'City', 'Street']);
  });

  it('two-way binds a nested field through its child tree', async () => {
    // The City input is inside the group; type into it and read root.address.city.
    const cityInput = Array.from(
      fixture.nativeElement.querySelectorAll('input') as NodeListOf<HTMLInputElement>,
    )[1]; // Name, City, Street → index 1 is City
    cityInput.value = 'Berlin';
    cityInput.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    const root = fixture.componentInstance.state.rootForm as unknown as {
      address: { city: FieldTree<string> };
    };
    expect(root.address.city().value()).toBe('Berlin');
  });
});

type WithItems = { items: { sku: string }[] };
const itemsConfig: FormConfig<WithItems> = {
  model: () => ({ items: [] }),
  ui: UiFormConfigBuilder.from({ items: [] as { sku: string }[] }).items(
    array(UiFormConfigBuilder.from({ sku: '' }).sku(text('SKU')), {
      label: 'Items',
      addLabel: 'Add item',
      removeLabel: 'Remove',
    }),
  ),
};

@Component({
  imports: [FormRenderer],
  template: `<ngx-formad-form [state]="state" />`,
})
class ArrayHost {
  readonly state = asRenderable(instantiateForm(itemsConfig));
}

describe('FormRenderer — repeating arrays', () => {
  let fixture: ComponentFixture<ArrayHost>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(ArrayHost);
    await pump(fixture);
  });

  const inputs = () =>
    Array.from(fixture.nativeElement.querySelectorAll('input') as NodeListOf<HTMLInputElement>);
  const button = (label: string) =>
    Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(
      (b) => b.textContent?.trim() === label,
    );

  it('starts empty, adds an item, binds it, and removes it', async () => {
    expect(inputs().length).toBe(0); // no items yet
    expect(fixture.nativeElement.querySelector('fieldset.ngx-formad-array')).toBeTruthy();

    button('Add item')!.click();
    await pump(fixture);
    expect(inputs().length).toBe(1); // one item's SKU field

    inputs()[0].value = 'ABC-1';
    inputs()[0].dispatchEvent(new Event('input'));
    await pump(fixture);
    const root = fixture.componentInstance.state.rootForm as unknown as {
      items: Record<number, { sku: FieldTree<string> }>;
    };
    expect(root.items[0].sku().value()).toBe('ABC-1');

    button('Remove')!.click();
    await pump(fixture);
    expect(inputs().length).toBe(0);
  });
});

type AB = { a: string; b: string };
const conditionalConfig: FormConfig<AB> = {
  model: () => ({ a: '', b: '' }),
  ui: UiFormConfigBuilder.from({ a: '', b: '' }).a(text('A')).b(text('B')),
  // B is hidden until A has a value — the native conditional-field primitive.
  schema: (p) => hidden(p.b, ({ valueOf }) => valueOf(p.a) === ''),
};

@Component({
  imports: [FormRenderer],
  template: `<ngx-formad-form [state]="state" />`,
})
class ConditionalHost {
  readonly state = asRenderable(instantiateForm(conditionalConfig));
}

describe('FormRenderer — conditional fields via hidden()', () => {
  it('drops a natively-hidden field and shows it when the condition flips', async () => {
    const fixture = TestBed.createComponent(ConditionalHost);
    await pump(fixture);
    const inputs = () =>
      Array.from(fixture.nativeElement.querySelectorAll('input') as NodeListOf<HTMLInputElement>);

    // A renders; B is hidden (A is empty).
    expect(inputs().length).toBe(1);

    inputs()[0].value = 'x';
    inputs()[0].dispatchEvent(new Event('input'));
    await pump(fixture);

    // A now has a value, so B appears.
    expect(inputs().length).toBe(2);
  });
});
