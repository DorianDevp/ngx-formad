import { UiFormConfigBuilder, email, select, text } from 'formodel';
import { extraInputsFor, flattenFields } from './form-config';

describe('flattenFields', () => {
  it('emits one field per top-level scalar control, in order', () => {
    const ui = UiFormConfigBuilder.from({ first: '', last: '' })
      .first(text('First'))
      .last(text('Last'));

    const fields = flattenFields(ui);

    expect(fields.map((f) => f.key)).toEqual(['first', 'last']);
    expect(fields[0].node.type).toBe('text');
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
