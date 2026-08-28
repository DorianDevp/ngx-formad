import { Component, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FieldTree, hidden } from '@angular/forms/signals';
import { array, UiFormConfigBuilder, email, text, select } from 'formodel';
import { defineForm, FormConfig, SelectOption } from '../form-config/form-config';
import { formLayout } from '../form-config/form-layout';
import { FormRenderer } from './form-renderer';
import { asRenderable, instantiateForm } from './instantiate-form';

async function pump(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

// `type` is a plain string, not the `''` literal: formodel 0.2 pins a custom
// control node to its declared value type, so a literal here would demand a
// `CustomControlNode<''>` the builder never produces.
type Account = { email: string; name: string; type: string };

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
    // Two options plus the empty one that stands for "nothing chosen yet" - the
    // model holds '', which is not among the options. (This fixture's options have
    // no descriptions, so they are compared by their DOM value: the option index.)
    const options = Array.from(select.querySelectorAll('option'));
    expect(options.map((o) => o.value)).toEqual(['', '0', '1']);
    expect(select.selectedIndex).toBe(0);
  });

  it('drops the empty option once the value is one of the options', async () => {
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = '1'; // the option's index is its DOM value
    select.dispatchEvent(new Event('change'));
    await pump(fixture);

    expect(fixture.componentInstance.state.model()['type']).toBe('User');
    expect(Array.from(select.querySelectorAll('option')).map((o) => o.value)).toEqual(['0', '1']);
    expect(select.selectedIndex).toBe(1);
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

// Options authored as a signal in a literal ui — the reactive layer's headline:
// instantiate first, seed the select whenever the data arrives.
const countryOptions = signal<SelectOption[]>([{ value: 'pl', description: 'Poland' }]);
const countryConfig = defineForm({
  model: () => ({ country: '' }),
  ui: { country: { type: 'select', label: 'Country', options: countryOptions } },
});

@Component({
  imports: [FormRenderer],
  template: `<ngx-formad-form [state]="state" />`,
})
class ReactiveHost {
  // `defineForm` kept the authored ui type, so this handle is the WritableSignal
  // itself — the typed seeding surface, no cast.
  readonly live = instantiateForm(countryConfig);
  readonly state = asRenderable(this.live);
}

describe('FormRenderer — reactive select options', () => {
  let fixture: ComponentFixture<ReactiveHost>;

  beforeEach(async () => {
    countryOptions.set([{ value: 'pl', description: 'Poland' }]);
    fixture = TestBed.createComponent(ReactiveHost);
    await pump(fixture);
  });

  // The empty option is present while the model's value matches none of them, so
  // the assertions below are about the real options after it.
  const optionTexts = () =>
    Array.from(fixture.nativeElement.querySelectorAll('option') as NodeListOf<HTMLElement>)
      .map((o) => o.textContent?.trim())
      .filter((text) => text !== '');

  it('renders the options the signal held at instantiation', () => {
    expect(optionTexts()).toEqual(['Poland']);
  });

  it('re-renders the select when the options are seeded after instantiation', async () => {
    fixture.componentInstance.live.ui.country.options.set([
      { value: 'pl', description: 'Poland' },
      { value: 'de', description: 'Germany' },
    ]);
    await pump(fixture);

    expect(optionTexts()).toEqual(['Poland', 'Germany']);
  });
});

@Component({ selector: 'test-echo', template: `<p class="echo">{{ value() }}</p>` })
class Echo {
  readonly value = input('');
}

type FL = { first: string; last: string };
const layoutConfig: FormConfig<FL> = {
  model: () => ({ first: '', last: '' }),
  ui: UiFormConfigBuilder.from({ first: '', last: '' }).first(text('First')).last(text('Last')),
  layout: formLayout<FL>()
    .field('first')
    .component(Echo, { inputs: { value: (ctx) => ctx.model.first } })
    .field('last')
    .build(),
};

@Component({
  imports: [FormRenderer],
  template: `<ngx-formad-form [state]="state" />`,
})
class LayoutHost {
  readonly state = asRenderable(instantiateForm(layoutConfig));
}

describe('FormRenderer — layout overlay with a component', () => {
  let fixture: ComponentFixture<LayoutHost>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(LayoutHost);
    await pump(fixture);
  });

  it('renders the component between the fields, in overlay order', () => {
    const order = Array.from(
      fixture.nativeElement.querySelectorAll('input, .echo') as NodeListOf<HTMLElement>,
    ).map((el) => (el.tagName === 'INPUT' ? 'input' : 'echo'));
    expect(order).toEqual(['input', 'echo', 'input']);
  });

  it('binds the component input to the live model, per keystroke', async () => {
    const first = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    first.value = 'Ada';
    first.dispatchEvent(new Event('input'));
    await pump(fixture);

    expect((fixture.nativeElement.querySelector('.echo') as HTMLElement).textContent?.trim()).toBe(
      'Ada',
    );
  });
});

// Content in the field flow: the same tag builder a page uses, so a group heading
// or a hint between fields is data rather than a component written for one line.
type FC = { first: string; last: string };
const contentConfig: FormConfig<FC> = {
  model: () => ({ first: '', last: '' }),
  ui: UiFormConfigBuilder.from({ first: '', last: '' }).first(text('First')).last(text('Last')),
  layout: formLayout<FC>()
    .content((c) => c.h3('Your name'))
    .field('first')
    .field('last')
    .content((c) => c.p('As it appears on the invoice.', { className: 'hint' }), {
      visibleWhen: (ctx) => ctx.model.first.length > 0,
    })
    .build(),
};

@Component({
  imports: [FormRenderer],
  template: `<ngx-formad-form [state]="state" />`,
})
class ContentLayoutHost {
  readonly state = asRenderable(instantiateForm(contentConfig));
}

describe('FormRenderer - layout overlay with content', () => {
  let fixture: ComponentFixture<ContentLayoutHost>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(ContentLayoutHost);
    await pump(fixture);
  });

  it('draws the block in overlay order', () => {
    const order = Array.from(
      fixture.nativeElement.querySelectorAll('h3, input') as NodeListOf<HTMLElement>,
    ).map((el) => el.tagName.toLowerCase());
    expect(order).toEqual(['h3', 'input', 'input']);
    expect((fixture.nativeElement.querySelector('h3') as HTMLElement).textContent).toBe('Your name');
  });

  it('gates a block on the live form', async () => {
    expect(fixture.nativeElement.querySelector('.hint')).toBeNull();

    const first = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    first.value = 'Ada';
    first.dispatchEvent(new Event('input'));
    await pump(fixture);

    expect((fixture.nativeElement.querySelector('.hint') as HTMLElement).textContent).toBe(
      'As it appears on the invoice.',
    );
  });
});

// ── Placement from the zero-dependency adapter lands as inline style ────────
// `cssLayout` (the DI default) answers with styles, not classes, and its property
// names are camel-case - so every consumer has to convert before touching CSSOM.
type Placed = { first: string; second: string };
const placedConfig: FormConfig<Placed> = {
  model: () => ({ first: '', second: '' }),
  ui: UiFormConfigBuilder.from({ first: '', second: '' }).first(text('First')).second(text('Second')),
  layout: formLayout<Placed>()
    .cols(2)
    .field('first', { colSpan: 2 })
    .component(Echo, { colSpan: 2, inputs: { value: (ctx) => ctx.model.first } })
    .field('second')
    .build(),
};

@Component({
  imports: [FormRenderer],
  template: `<ngx-formad-form [state]="state" />`,
})
class PlacedHost {
  readonly state = asRenderable(instantiateForm(placedConfig));
}

describe('FormRenderer - placement under the default layout adapter', () => {
  let fixture: ComponentFixture<PlacedHost>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(PlacedHost);
    await pump(fixture);
  });

  it("puts a field's colSpan on the control host", () => {
    // The control component's own host element *is* the grid item - no wrapper.
    const host = fixture.nativeElement.querySelector('ngx-formad-text') as HTMLElement;
    expect(host).toBeTruthy();
    expect(host.style.gridColumn).toBe('span 2 / span 2');
  });

  it("puts a component's colSpan on its slot", () => {
    // test-echo › component-outlet › the grid slot div
    const slot = (fixture.nativeElement.querySelector('test-echo') as HTMLElement).closest('div')!;
    expect(slot.tagName.toLowerCase()).toBe('div');
    expect(slot.style.gridColumn).toBe('span 2 / span 2');
  });
});

// ── An outlet follows its node instead of freezing the first one ────────────
type Swapped = { v: string };
const labelled = (label: string): FormConfig<Swapped> => ({
  model: () => ({ v: '' }),
  ui: UiFormConfigBuilder.from({ v: '' }).v(text(label)),
});

@Component({
  imports: [FormRenderer],
  template: `<ngx-formad-form [state]="state()" />`,
})
class SwapHost {
  private readonly first = asRenderable(instantiateForm(labelled('First form')));
  private readonly second = asRenderable(instantiateForm(labelled('Second form')));
  readonly state = signal(this.first);

  swap(): void {
    this.state.set(this.second);
  }
}

describe('FieldOutlet - a swapped config', () => {
  it('re-renders the field when the config at the same key changes', async () => {
    const fixture = TestBed.createComponent(SwapHost);
    await pump(fixture);
    expect(fixture.nativeElement.textContent).toContain('First form');

    // The node key is the same ('v'), so the grid reuses the outlet - the control
    // has to be rebuilt from the new config rather than kept with the old label.
    fixture.componentInstance.swap();
    await pump(fixture);

    expect(fixture.nativeElement.textContent).toContain('Second form');
    expect(fixture.nativeElement.textContent).not.toContain('First form');
    expect(fixture.nativeElement.querySelectorAll('input')).toHaveLength(1);
  });
});
