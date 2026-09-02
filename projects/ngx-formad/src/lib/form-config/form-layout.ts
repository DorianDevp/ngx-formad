import { Type } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { ItemSpec, LayoutSpec, Responsive } from '../layout/layout-adapter';
import { ContentBuild, buildContent } from '../builders/content';
import { InputKeys, InputVal } from '../builders/dynamic-component';
import { FormLayout, FormLayoutContext, FormLayoutItem } from './form-config';

type ControlValue<C> = C extends FormValueControl<infer V> ? V : never;

type ValueFits<V, C> = V extends ControlValue<C> ? unknown : never;

export type FormFieldManaged = keyof FormValueControl<unknown>;

type PresentationalKeys<C> = InputKeys<Omit<C, FormFieldManaged>>;

export interface FormControlCfg<C, M extends Record<string, unknown>> extends ItemSpec {
  readonly inputs?: {
    [K in PresentationalKeys<C>]?: InputVal<C, K> | ((ctx: FormLayoutContext<M>) => InputVal<C, K>);
  } & { [K in Exclude<keyof C, PresentationalKeys<C>>]?: never };
}

export interface FormContentCfg<M extends Record<string, unknown>> extends ItemSpec {
  readonly visibleWhen?: (ctx: FormLayoutContext<M>) => boolean;
}

function itemOf(cfg: ItemSpec): ItemSpec | undefined {
  const item: { colSpan?: Responsive<number>; colStart?: Responsive<number> } = {};
  if (cfg.colSpan != null) item.colSpan = cfg.colSpan;
  if (cfg.colStart != null) item.colStart = cfg.colStart;
  return item.colSpan != null || item.colStart != null ? item : undefined;
}

export class FormLayoutBuilder<M extends Record<string, unknown>> {
  private readonly _items: FormLayoutItem<M>[] = [];
  private _grid: LayoutSpec = {};

  cols(cols: Responsive<number>): this {
    this._grid = { ...this._grid, cols };
    return this;
  }

  gap(gap: number): this {
    this._grid = { ...this._grid, gap };
    return this;
  }

  field(key: keyof M & string, item?: ItemSpec): this {
    this._items.push({ kind: 'field', key, item });
    return this;
  }

  fields(...keys: (keyof M & string)[]): this {
    for (const key of keys) this._items.push({ kind: 'field', key });
    return this;
  }

  control<K extends keyof M & string, C>(
    key: K,
    control: Type<C> & ValueFits<M[K], C>,
    cfg: FormControlCfg<C, M> = {},
  ): this {
    this._items.push({
      kind: 'control',
      key,
      control: { component: control, inputs: cfg.inputs ?? {} },
      item: itemOf(cfg),
    });
    return this;
  }

  content(build: ContentBuild, cfg: FormContentCfg<M> = {}): this {
    this._items.push({
      kind: 'content',
      children: buildContent(build),
      visibleWhen: cfg.visibleWhen,
      item: itemOf(cfg),
    });
    return this;
  }

  row(grid: LayoutSpec, build: (row: FormLayoutBuilder<M>) => void, item?: ItemSpec): this {
    const row = new FormLayoutBuilder<M>();
    build(row);
    this._items.push({ kind: 'row', grid, item, children: row._items });
    return this;
  }

  build(): FormLayout<M> {
    return { grid: this._grid, items: this._items };
  }
}

export function formLayout<M extends Record<string, unknown>>(): FormLayoutBuilder<M> {
  return new FormLayoutBuilder<M>();
}
