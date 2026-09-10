import { isSignal, signal } from '@angular/core';
import { UiFormConfigBuilder, email, select, text } from 'formodel';
import {
  buildLayoutNodes,
  buildNodes,
  ErasedUi,
  extraInputsFor,
  FormLayoutItem,
  FormRowNode,
  flattenFields,
  GroupNode,
  SignalControlNode,
  RenderNodeKind,
  SelectOption,
} from './form-config';
import { formLayout } from './form-layout';

type Names = { first: string; last: string; password: string };

describe('flattenFields', () => {
  it('emits one field per top-level scalar control, in order', () => {
    const ui: ErasedUi = UiFormConfigBuilder.from({ first: '', last: '' })
      .first(text('First'))
      .last(text('Last'));

    const fields = flattenFields(ui);

    expect(fields.map((f) => f.key)).toEqual(['first', 'last']);
    expect(fields[0].node.type).toBe('text');
  });

  it('flattens nested-group leaves with their full path', () => {
    const ui: ErasedUi = UiFormConfigBuilder.from({ name: '', address: { city: '', street: '' } })
      .name(text('Name'))
      .address({ label: 'Address', maxCols: 2 }, (b) => b.city(text('City')).street(text('Street')));

    const fields = flattenFields(ui);

    expect(fields.map((f) => f.path.join('.'))).toEqual(['name', 'address.city', 'address.street']);
  });
});

describe('buildNodes', () => {
  it('builds a group node for a nested object, with its children', () => {
    const ui: ErasedUi = UiFormConfigBuilder.from({ name: '', address: { city: '', street: '' } })
      .name(text('Name'))
      .address({ label: 'Address', maxCols: 2 }, (b) => b.city(text('City')).street(text('Street')));

    const nodes = buildNodes(ui);

    expect(nodes.map((n) => n.kind)).toEqual([RenderNodeKind.Control, RenderNodeKind.Group]);
    const group = nodes[1] as GroupNode;
    expect(group.label).toBe('Address');
    expect(group.maxCols).toBe(2);
    expect(group.children.map((c) => c.key)).toEqual(['city', 'street']);
    expect(group.children.every((c) => c.kind === RenderNodeKind.Control)).toBe(true);
  });
});

describe('extraInputsFor', () => {
  it('passes the native input type through for text-like kinds, as signals', () => {
    const inputs = extraInputsFor(email('Email'));

    expect(inputs['label']()).toBe('Email');
    expect(inputs['type']()).toBe('email');
  });

  it('maps select options from description to label', () => {
    const node = select('Role', [
      { value: 'admin', description: 'Admin' },
      { value: 'user', description: 'User' },
    ]);

    expect(extraInputsFor(node)['options']()).toEqual([
      { value: 'admin', label: 'Admin' },
      { value: 'user', label: 'User' },
    ]);
  });

  it('includes a placeholder only activeWhen the node carries one', () => {
    expect(extraInputsFor(text('Name'))).not.toHaveProperty('placeholder');
    expect(extraInputsFor(text('Name', { placeholder: 'Jane' }))['placeholder']()).toBe('Jane');
  });
});

describe('extraInputsFor - live props', () => {
  it('follows signal-backed select options through a computed', () => {
    const options = signal<SelectOption[]>([{ value: 'admin', description: 'Admin' }]);
    const node: SignalControlNode = { type: 'select', label: 'Role', options };

    const mapped = extraInputsFor(node)['options'];

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

  it('reads a live label and a plain one alike', () => {
    const label = signal('Role');
    const node: SignalControlNode = { type: 'text', label };

    expect(extraInputsFor(node)['label']()).toBe('Role');

    label.set('Function');
    expect(extraInputsFor(node)['label']()).toBe('Function');
    expect(extraInputsFor(text('Name'))['label']()).toBe('Name');
  });
});

describe('buildLayoutNodes', () => {
  const ui: ErasedUi = UiFormConfigBuilder.from({ first: '', last: '', password: '' })
    .first(text('First'))
    .last(text('Last'))
    .password(text('Password'));

  it('resolves fields by key in overlay order, applying placement', () => {
    const { items } = formLayout<Names>().field('last').field('first', { colSpan: 2 }).build();

    const nodes = buildLayoutNodes(ui, items);

    expect(nodes.map((n) => n.key)).toEqual(['last', 'first']);
    expect(nodes[1]).toMatchObject({ kind: RenderNodeKind.Control, key: 'first', layout: { colSpan: 2 } });
  });

  it('skips a field key that has no matching ui entry', () => {
    const { items } = formLayout<Names & { missing: string }>().field('first').field('missing').build();

    const nodes = buildLayoutNodes(ui, items);

    expect(nodes.map((n) => n.key)).toEqual(['first']);
  });

  it('builds a row node whose children resolve against the same ui', () => {
    const { items } = formLayout<Names>()
      .row((row) => row.field('first').field('last'), { cols: 2 })
      .build();

    const nodes = buildLayoutNodes(ui, items);
    const row = nodes[0] as FormRowNode;

    expect(row.kind).toBe(RenderNodeKind.Row);
    expect(row.grid).toEqual({ cols: 2 });
    expect(row.children.map((c) => c.key)).toEqual(['first', 'last']);
  });
});
