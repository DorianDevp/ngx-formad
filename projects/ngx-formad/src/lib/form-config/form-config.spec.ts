import { UiFormConfigBuilder, email, select, text, UiFormGroupConfig } from 'formodel';
import { buildNodes, extraInputsFor, flattenFields, GroupNode } from './form-config';

const erase = (ui: unknown) => ui as UiFormGroupConfig<Record<string, unknown>>;

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
