import { tailwindLayout } from './tailwind-layout';

describe('tailwindLayout', () => {
  it('draws a container from Tailwind grid utilities', () => {
    expect(tailwindLayout.container({}).class).toBe('grid');
    expect(tailwindLayout.container({ cols: 2, gap: 4 }).class).toBe('grid grid-cols-2 gap-4');
  });

  it('prefixes every breakpoint but base with its screen', () => {
    expect(tailwindLayout.container({ cols: { base: 1, md: 2, lg: 3 } }).class).toBe(
      'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    );
  });

  it('says nothing about an item that asks for nothing', () => {
    expect(tailwindLayout.item({})).toEqual({});
  });

  it('spans and starts an item, per breakpoint', () => {
    expect(tailwindLayout.item({ colSpan: { base: 1, md: 2 }, colStart: 3 }).class).toBe(
      'col-span-1 md:col-span-2 col-start-3',
    );
  });
});
