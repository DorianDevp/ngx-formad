import { signal } from '@angular/core';
import { ContentTagChild } from '../builders/content';
import {
  FormContentSpec,
  FormFieldItem,
  FormContext,
  FormLayoutItem,
  FormLayoutItemKind,
  FormRowItem,
} from './form-config';
import { formLayout } from './form-layout';

type Model = { first: string; last: string; password: string };

function isField(item: FormLayoutItem<Model>): item is FormFieldItem<Model> {
  return item.kind === FormLayoutItemKind.Field;
}

describe('formLayout', () => {
  it('records fields in the order they are added, with placement', () => {
    const { items } = formLayout<Model>().field('first', { colSpan: { md: 1 } }).field('last').build();

    expect(items.map((item) => (isField(item) ? item.key : item.kind))).toEqual(['first', 'last']);
    expect(items[0]).toMatchObject({
      kind: FormLayoutItemKind.Field,
      key: 'first',
      item: { colSpan: { md: 1 } },
    });
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
        visibleWhen: (ctx) => ctx.model().password.length > 0,
      })
      .build();

    const head = items[0] as FormContentSpec<Model>;
    expect(head.kind).toBe(FormLayoutItemKind.Content);
    expect(head.item).toEqual({ colSpan: 2 });
    expect((head.children[0] as ContentTagChild).tag).toBe('h3');

    const hint = items[2] as FormContentSpec<Model>;
    const ctx = (password: string): FormContext<Model> => ({
      model: signal({ first: '', last: '', password }),
      ui: {},
      fields: [],
    });
    expect(hint.visibleWhen?.(ctx(''))).toBe(false);
    expect(hint.visibleWhen?.(ctx('long enough'))).toBe(true);
  });

  it('nests a row with its own grid and children', () => {
    const { items } = formLayout<Model>()
      .row((row) => row.field('first').field('last'), { cols: 2 })
      .build();

    expect(items[0]).toMatchObject({ kind: FormLayoutItemKind.Row, grid: { cols: 2 } });
    const row = items[0] as FormRowItem<Model>;
    expect(row.children.map((c) => (isField(c) ? c.key : c.kind))).toEqual(['first', 'last']);
  });
});
