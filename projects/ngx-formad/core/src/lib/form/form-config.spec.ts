import { isSignal, signal } from '@angular/core';
import { CustomFieldNode, UiFormConfigBuilder, email, select, text } from 'formodel';
import { extraInputsFor } from './control-inputs';
import { formLayout } from './form-layout';
import { buildLayoutNodes, buildNodes, flattenFields } from './render-tree';
import { PlacesCustomFields } from './types/form-config';
import { FormLayoutItem } from './types/form-layout';
import { FormRowNode, GroupNode, RenderNodeKind } from './types/render-tree';
import { ErasedUi, SelectOption, SignalControlNode } from './types/ui-nodes';

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

  it('includes a placeholder only when the node carries one', () => {
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

  it('builds a component node keyed by its position, carrying the config as placed', () => {
    const config = { component: class Probe {}, placement: { colSpan: 2 } };
    const { items } = formLayout<Names>().field('first').component(config).build();

    const nodes = buildLayoutNodes(ui, items);

    expect(nodes[1]).toMatchObject({
      kind: RenderNodeKind.Component,
      key: '@component:1',
      path: ['@component:1'],
      config,
      layout: { colSpan: 2 },
    });
  });
});

// The refusal for an unplaced `customField()` is a TYPE, so only a type can guard it - a
// runtime assertion cannot tell `unknown` from `Rejected<...>`. This is the test that was
// missing when a change to `PlacesCustomFields` silently switched the whole guard off.
type IsRefusal<T> = T extends { readonly 'ngx-formad': string } ? true : false;

describe('PlacesCustomFields', () => {
  it('refuses a customField() that no control() placed', () => {
    const refused: IsRefusal<PlacesCustomFields<{ rating: CustomFieldNode }, {}>> = true;
    expect(refused).toBe(true);
  });

  it('accepts one the layout placed with control()', () => {
    const accepted: IsRefusal<PlacesCustomFields<{ rating: CustomFieldNode }, { rating: object }>> = false;
    expect(accepted).toBe(false);
  });

  it('refuses one nested in a group, where no control() reaches it', () => {
    type Ui = { address: { controlsConfig: { token: CustomFieldNode } } };
    const refused: IsRefusal<PlacesCustomFields<Ui, {}>> = true;
    expect(refused).toBe(true);
  });

  // `omit()` keeps the dev-mode warning quiet; it does not excuse a customField from placement.
  it('records the omitted keys on the built layout', () => {
    const layout = formLayout<{ name: string; token: string }>().field('name').omit('token').build();

    expect(layout.omitted).toEqual(['token']);
  });

  it('takes a row\'s own omit() into the layout that holds it', () => {
    const layout = formLayout<{ name: string; token: string }>()
      .row((r) => r.omit('token').field('name'))
      .build();

    expect(layout.omitted).toEqual(['token']);
  });
});
