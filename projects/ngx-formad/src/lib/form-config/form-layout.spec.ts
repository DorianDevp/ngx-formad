import { ContentTagChild } from '../builders/content';
import { FormContentSpec, FormLayoutContext, FormLayoutItem } from './form-config';
import { formLayout } from './form-layout';

type Model = { first: string; last: string; password: string };

// Narrowers for the discriminated layout items.
const isField = (i: FormLayoutItem<Model>): i is { kind: 'field'; key: keyof Model & string } =>
  i.kind === 'field';

describe('formLayout', () => {
  it('records fields in the order they are added, with placement', () => {
    const { items } = formLayout<Model>().field('first', { colSpan: { md: 1 } }).field('last').build();

    expect(items.map((i) => (isField(i) ? i.key : i.kind))).toEqual(['first', 'last']);
    expect(items[0]).toMatchObject({ kind: 'field', key: 'first', item: { colSpan: { md: 1 } } });
  });

  it('carries the container grid', () => {
    const { grid } = formLayout<Model>().cols({ base: 1, md: 2 }).gap(4).build();
    expect(grid).toEqual({ cols: { base: 1, md: 2 }, gap: 4 });
  });

  it('lifts a content block, gated on the live form', () => {
    const { items } = formLayout<Model>()
      .content((c) => c.h3('Sign-in'), { colSpan: 2 })
      .field('password')
      .content((c) => c.p('Pick something long.', { className: 'hint' }), {
        visibleWhen: (ctx) => ctx.model.password.length > 0,
      })
      .build();

    const head = items[0] as FormContentSpec<Model>;
    expect(head.kind).toBe('content');
    expect(head.item).toEqual({ colSpan: 2 });
    expect((head.children[0] as ContentTagChild).tag).toBe('h3');

    const hint = items[2] as FormContentSpec<Model>;
    const ctx = (password: string) => ({ model: { password }, shared: null }) as FormLayoutContext<Model>;
    expect(hint.visibleWhen?.(ctx(''))).toBe(false);
    expect(hint.visibleWhen?.(ctx('long enough'))).toBe(true);
  });

  it('nests a row with its own grid and children', () => {
    const { items } = formLayout<Model>()
      .row({ cols: 2 }, (row) => row.field('first').field('last'))
      .build();

    expect(items[0]).toMatchObject({ kind: 'row', grid: { cols: 2 } });
    const row = items[0] as Extract<FormLayoutItem<Model>, { kind: 'row' }>;
    expect(row.children.map((c) => (isField(c) ? c.key : c.kind))).toEqual(['first', 'last']);
  });
});
