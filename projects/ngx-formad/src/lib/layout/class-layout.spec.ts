import { classLayout } from './class-layout';

describe('classLayout', () => {
  it('always emits the grid marker class', () => {
    expect(classLayout.container({}).class).toBe('ngx-formad-grid');
  });

  it('emits a constant column count and gap as classes', () => {
    expect(classLayout.container({ cols: 2, gap: 4 }).class).toBe(
      'ngx-formad-grid ngx-formad-cols-2 ngx-formad-gap-4',
    );
  });

  it('emits one column class per breakpoint, base unprefixed', () => {
    expect(classLayout.container({ cols: { base: 1, md: 2, lg: 3 } }).class).toBe(
      'ngx-formad-grid ngx-formad-cols-1 ngx-formad-cols-md-2 ngx-formad-cols-lg-3',
    );
  });

  it('emits nothing for an empty item', () => {
    expect(classLayout.item({})).toEqual({});
  });

  it('emits span and start classes per breakpoint', () => {
    expect(classLayout.item({ colSpan: { base: 1, md: 2 }, colStart: 3 }).class).toBe(
      'ngx-formad-col-1 ngx-formad-col-md-2 ngx-formad-col-start-3',
    );
  });
});
