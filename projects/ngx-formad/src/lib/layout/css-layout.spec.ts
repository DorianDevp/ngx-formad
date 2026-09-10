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

  it('resolves the base breakpoint of a responsive column count', () => {
    const { style } = cssLayout.container({ cols: { base: 2, md: 4 } });
    expect(style?.['gridTemplateColumns']).toBe('repeat(2, minmax(0, 1fr))');
  });

  it('emits a column span/start only activeWhen asked for', () => {
    expect(cssLayout.item({})).toEqual({});
    expect(cssLayout.item({ colSpan: 2 })).toEqual({
      style: { gridColumn: 'span 2 / span 2' },
    });
    expect(cssLayout.item({ colSpan: 2, colStart: 3 })).toEqual({
      style: { gridColumn: 'span 2 / span 2', gridColumnStart: '3' },
    });
  });

  it('resolves the base breakpoint of a responsive span', () => {
    expect(cssLayout.item({ colSpan: { base: 1, md: 2 } })).toEqual({
      style: { gridColumn: 'span 1 / span 1' },
    });
  });
});
