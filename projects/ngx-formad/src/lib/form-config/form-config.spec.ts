import { isSignal, Signal, signal } from '@angular/core';
import { UiFormConfigBuilder, email, select, text, UiFormGroupConfig } from 'formodel';
import {
  buildLayoutNodes,
  buildNodes,
  extraInputsFor,
  FormLayoutItem,
  FormRowNode,
  flattenFields,
  GroupNode,
  SelectOption,
} from './form-config';
import { formLayout } from './form-layout';
import { reactive, ReactiveControlNode, readReactive } from './reactive';

const erase = (ui: unknown) => ui as UiFormGroupConfig<Record<string, unknown>>;
const eraseItems = (items: readonly FormLayoutItem<Record<string, string>>[]) =>
  items as unknown as readonly FormLayoutItem<Record<string, unknown>>[];

describe('flattenFields', () => {
  it('emits one field per top-level scalar control, in order', () => {
    const ui = UiFormConfigBuilder.from({ first: '', last: '' })
      .first(text('First'))
      .last(text('Last'));

    const fields = flattenFields(erase(ui));

    expect(fields.map((f) => f.key)).toEqual(['first', 'last']);
    expect(fields[0].node.type).toBe('text');
  });

  it('flattens nested-group leaves with their full path', () => {
    const ui = UiFormConfigBuilder.from({ name: '', address: { city: '', street: '' } })
      .name(text('Name'))
      .address({ label: 'Address', maxCols: 2 }, (b) =>
        b.city(text('City')).street(text('Street')),
      );

    const fields = flattenFields(erase(ui));

    expect(fields.map((f) => f.path.join('.'))).toEqual(['name', 'address.city', 'address.street']);
  });
});

describe('buildNodes', () => {
  it('builds a group node for a nested object, with its children', () => {
    const ui = UiFormConfigBuilder.from({ name: '', address: { city: '', street: '' } })
      .name(text('Name'))
      .address({ label: 'Address', maxCols: 2 }, (b) =>
        b.city(text('City')).street(text('Street')),
      );

    const nodes = buildNodes(erase(ui));

    expect(nodes.map((n) => n.kind)).toEqual(['control', 'group']);
    const group = nodes[1] as GroupNode;
    expect(group.label).toBe('Address');
    expect(group.maxCols).toBe(2);
    expect(group.children.map((c) => c.key)).toEqual(['city', 'street']);
    expect(group.children.every((c) => c.kind === 'control')).toBe(true);
  });
});

describe('extraInputsFor', () => {
  it('passes the native input type through for text-like kinds', () => {
    expect(extraInputsFor(email('Email'))).toMatchObject({
      label: 'Email',
      type: 'email',
    });
  });

  it('maps select options from description to label', () => {
    const node = select('Role', [
      { value: 'admin', description: 'Admin' },
      { value: 'user', description: 'User' },
    ]);

    expect(extraInputsFor(node)['options']).toEqual([
      { value: 'admin', label: 'Admin' },
      { value: 'user', label: 'User' },
    ]);
  });

  it('includes a placeholder only when the node carries one', () => {
    expect(extraInputsFor(text('Name'))).not.toHaveProperty('placeholder');
    expect(extraInputsFor(text('Name', { placeholder: 'Jane' }))).toHaveProperty(
      'placeholder',
      'Jane',
    );
  });
});

describe('extraInputsFor — reactive props', () => {
  it('maps signal-backed select options through a live computed', () => {
    const options = signal<SelectOption[]>([{ value: 'admin', description: 'Admin' }]);
    const node: ReactiveControlNode = { type: 'select', label: 'Role', options };

    const mapped = extraInputsFor(node)['options'] as Signal<
      readonly { value: unknown; label: string }[]
    >;

    // The mapping stays live: it is a computed over the authored signal, so
    // seeding the options after instantiation re-maps without re-rendering.
    expect(isSignal(mapped)).toBe(true);
    expect(mapped()).toEqual([{ value: 'admin', label: 'Admin' }]);

    options.set([
      { value: 'admin', description: 'Admin' },
      { value: 'user', description: 'User' },
    ]);
    expect(mapped()).toEqual([
      { value: 'admin', label: 'Admin' },
      { value: 'user', label: 'User' },
    ]);
  });

  it('threads a signal through formodel builder helpers via reactive()', () => {
    const options = signal<SelectOption[]>([{ value: 'a', description: 'A' }]);
    const node = select('Role', reactive(options));

    const mapped = extraInputsFor(node)['options'];

    expect(isSignal(mapped)).toBe(true);
    expect(readReactive(mapped)).toEqual([{ value: 'a', label: 'A' }]);
  });

  it('readReactive unwraps a signal and passes a plain value through', () => {
    expect(readReactive('x')).toBe('x');
    expect(readReactive(signal('y'))).toBe('y');
  });
});

describe('buildLayoutNodes', () => {
  const ui = erase(
    UiFormConfigBuilder.from({ first: '', last: '', password: '' })
      .first(text('First'))
      .last(text('Last'))
      .password(text('Password')),
  );

  it('resolves fields by key in overlay order, applying placement', () => {
    const { items } = formLayout<Record<string, string>>()
      .field('last')
      .field('first', { colSpan: 2 })
      .build();

    const nodes = buildLayoutNodes(ui, eraseItems(items));

    expect(nodes.map((n) => n.key)).toEqual(['last', 'first']);
    expect(nodes[1]).toMatchObject({ kind: 'control', key: 'first', layout: { colSpan: 2 } });
  });

  it('skips a field key that has no matching ui entry', () => {
    const { items } = formLayout<Record<string, string>>().field('first').field('missing').build();
    const nodes = buildLayoutNodes(ui, eraseItems(items));
    expect(nodes.map((n) => n.key)).toEqual(['first']);
  });

  it('builds a row node whose children resolve against the same ui', () => {
    const { items } = formLayout<Record<string, string>>()
      .row({ cols: 2 }, (row) => row.field('first').field('last'))
      .build();

    const nodes = buildLayoutNodes(ui, eraseItems(items));
    const row = nodes[0] as FormRowNode;

    expect(row.kind).toBe('row');
    expect(row.grid).toEqual({ cols: 2 });
    expect(row.children.map((c) => c.key)).toEqual(['first', 'last']);
  });
});
