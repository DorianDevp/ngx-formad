import { responsiveEntries } from './layout-adapter';

describe('responsiveEntries', () => {
  it('returns nothing for a null/undefined value', () => {
    expect(responsiveEntries(undefined)).toEqual([]);
    expect(responsiveEntries(null)).toEqual([]);
  });

  it('treats a bare value as the base breakpoint', () => {
    expect(responsiveEntries(2)).toEqual([['base', 2]]);
  });

  it('orders base first and drops null-valued breakpoints', () => {
    expect(responsiveEntries({ md: 2, base: 1, lg: undefined })).toEqual([
      ['base', 1],
      ['md', 2],
    ]);
  });

  it('accepts arbitrary consumer-defined breakpoint names', () => {
    expect(responsiveEntries({ tablet: 6, desktop: 12 })).toEqual([
      ['tablet', 6],
      ['desktop', 12],
    ]);
  });
});
