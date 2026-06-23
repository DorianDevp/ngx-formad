import { cssLayout } from './css-layout';

describe('cssLayout', () => {
  it('defaults a container to a single column with the standard gap', () => {
    const { style } = cssLayout.container({});
    expect(style).toEqual({
      display: 'grid',
      gridTemplateColumns: 'repeat(1, minmax(0, 1fr))',
      gap: '1rem',
    });
  });

  it('honours an explicit column count and gap', () => {
    const { style } = cssLayout.container({ cols: 3, gap: 2 });
    expect(style?.['gridTemplateColumns']).toBe('repeat(3, minmax(0, 1fr))');
    expect(style?.['gap']).toBe('0.5rem');
  });

  it('emits a column span only when one is asked for', () => {
    expect(cssLayout.item({})).toEqual({});
    expect(cssLayout.item({ colSpan: 2 })).toEqual({
      style: { gridColumn: 'span 2' },
    });
  });
});
