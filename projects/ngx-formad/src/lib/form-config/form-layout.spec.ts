import { Component, input } from '@angular/core';
import { FormComponentContext, FormComponentSpec, FormLayoutItem } from './form-config';
import { formLayout } from './form-layout';

type Model = { first: string; last: string; password: string };

@Component({ selector: 'test-note', template: '' })
class NoteComponent {
  readonly value = input('');
}

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

  it('lifts a component, splitting placement from inputs', () => {
    const { items } = formLayout<Model>()
      .field('password')
      .component(NoteComponent, {
        colSpan: 2,
        inputs: { value: (ctx) => ctx.model.password },
      })
      .build();

    const spec = items[1] as FormComponentSpec<Model>;
    expect(spec.kind).toBe('component');
    expect(spec.component).toBe(NoteComponent);
    expect(spec.item).toEqual({ colSpan: 2 });
    const ctx = { model: { password: 'secret' } } as FormComponentContext<Model>;
    expect(spec.inputs?.['value']?.(ctx)).toBe('secret');
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
