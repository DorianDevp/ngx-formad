import { Type } from '@angular/core';
import { ItemSpec, LayoutSpec, Responsive } from '../layout/layout-adapter';
import { InputKeys, InputVal, OutputKeys, OutputVal } from '../builders/dynamic-component';
import { FormComponentContext, FormComponentSpec, FormLayout, FormLayoutItem } from './form-config';

// The layout overlay is authored here, separate from field-building: `ui` still
// declares the fields (kind/label/options); this only decides render order, grid
// placement, and where components sit. A component's inputs/outputs are functions
// of the live form context, so they bind reactively without the author wiring
// anything — `value: ctx => ctx.model.password` tracks the field as it is typed.

/** Typed authoring config for a layout component: its grid placement (`colSpan`/
 *  `colStart`), plus inputs/outputs written as functions of the live form context
 *  and an optional visibility gate. Only the component's real inputs/outputs are
 *  accepted, with their value/event types. */
export interface FormComponentCfg<C, M extends Record<string, unknown>> extends ItemSpec {
  readonly inputs?: { [K in InputKeys<C>]?: (ctx: FormComponentContext<M>) => InputVal<C, K> };
  readonly outputs?: { [K in OutputKeys<C>]?: (event: OutputVal<C, K>) => void };
  readonly visibleWhen?: (ctx: FormComponentContext<M>) => boolean;
}

// Splits an `ItemSpec` (colSpan/colStart) out of a component cfg — the placement
// half — leaving inputs/outputs/visibility for the spec's own fields.
function itemOf(cfg: ItemSpec): ItemSpec | undefined {
  const item: { colSpan?: Responsive<number>; colStart?: Responsive<number> } = {};
  if (cfg.colSpan != null) item.colSpan = cfg.colSpan;
  if (cfg.colStart != null) item.colStart = cfg.colStart;
  return item.colSpan != null || item.colStart != null ? item : undefined;
}

/**
 * Fluent builder for a form's layout overlay. Items render in the order you add
 * them: `field` places a declared field (by key, with an optional grid span),
 * `component` drops a component, `row` opens a nested sub-grid. `cols`/`gap` set
 * the container grid. Type `M` to your model so field keys are checked.
 */
export class FormLayoutBuilder<M extends Record<string, unknown>> {
  private readonly _items: FormLayoutItem<M>[] = [];
  private _grid: LayoutSpec = {};

  /** The container's column count (responsive), e.g. `{ base: 1, md: 2 }`. */
  cols(cols: Responsive<number>): this {
    this._grid = { ...this._grid, cols };
    return this;
  }

  /** The container's gap, on the 0.25rem spacing scale (`4` → 1rem). */
  gap(gap: number): this {
    this._grid = { ...this._grid, gap };
    return this;
  }

  /** Place one field, optionally spanning/starting at specific columns. */
  field(key: keyof M & string, item?: ItemSpec): this {
    this._items.push({ kind: 'field', key, item });
    return this;
  }

  /** Place several fields in order, each single-column — the terse common case. */
  fields(...keys: (keyof M & string)[]): this {
    for (const key of keys) this._items.push({ kind: 'field', key });
    return this;
  }

  /** Drop a component here, its inputs/outputs bound to the live form context. */
  component<C>(component: Type<C>, cfg: FormComponentCfg<C, M> = {}): this {
    this._items.push({
      kind: 'component',
      component: component as Type<unknown>,
      inputs: cfg.inputs as FormComponentSpec<M>['inputs'],
      outputs: cfg.outputs as FormComponentSpec<M>['outputs'],
      visibleWhen: cfg.visibleWhen,
      item: itemOf(cfg),
    });
    return this;
  }

  /** A nested row: its own sub-grid (`grid`) over items from a sub-builder, placed
   *  in the parent grid via `item`. Use it for a cluster with its own column count. */
  row(grid: LayoutSpec, build: (row: FormLayoutBuilder<M>) => void, item?: ItemSpec): this {
    const row = new FormLayoutBuilder<M>();
    build(row);
    this._items.push({ kind: 'row', grid, item, children: row._items });
    return this;
  }

  /** The finished overlay, for `FormConfig.layout`. */
  build(): FormLayout<M> {
    return { grid: this._grid, items: this._items };
  }
}

/** Start a layout overlay for model `M`. Field keys on `.field(...)` are checked
 *  against `M`; set the result on `FormConfig.layout`. */
export function formLayout<M extends Record<string, unknown>>(): FormLayoutBuilder<M> {
  return new FormLayoutBuilder<M>();
}
