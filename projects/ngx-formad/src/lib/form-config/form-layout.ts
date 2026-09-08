import { ContentBuild, buildContent } from '../builders/content';
import { GridPlacement, GridLayout } from '../layout/layout-adapter';
import { FormLayout, FormLayoutContext, FormLayoutItem, FormLayoutItemKind, FieldComponentConfig } from './form-config';

/** Placement of a content block: its grid span and a gate read from the layout context. */
export interface FormContentCfg<M extends Record<string, unknown>> extends GridPlacement {
  visibleWhen?(ctx: FormLayoutContext<M>): boolean;
}

/** A row's own grid plus its placement in the parent grid. */
export interface FormRowCfg extends GridLayout, GridPlacement {}

function itemOf(cfg: GridPlacement): GridPlacement | undefined {
  const item: GridPlacement = {
    ...(cfg.colSpan != null ? { colSpan: cfg.colSpan } : {}),
    ...(cfg.colStart != null ? { colStart: cfg.colStart } : {}),
  };

  return Object.keys(item).length ? item : undefined;
}

/** Arranges a form's declared fields: grid, order, placed components, prose and nested rows. */
export class FormLayoutBuilder<M extends Record<string, unknown>> {
  private items: readonly FormLayoutItem<M>[] = [];

  private grid: GridLayout = {};

  cols(cols: GridLayout['cols']): this {
    this.grid = { ...this.grid, cols };

    return this;
  }

  gap(gap: number): this {
    this.grid = { ...this.grid, gap };

    return this;
  }

  field(key: keyof M & string, item?: GridPlacement): this {
    this.items = [...this.items, { kind: FormLayoutItemKind.Field, key, item }];

    return this;
  }

  fields(...keys: (keyof M & string)[]): this {
    this.items = [...this.items, ...keys.map((key) => ({ kind: FormLayoutItemKind.Field, key }) as const)];

    return this;
  }

  /** Draws the field with a component of your own, one that edits the field's value type; it takes what `createComponent` binds. */
  control<K extends keyof M & string>(key: K, config: FieldComponentConfig<M[K]>): this {
    this.items = [...this.items, { kind: FormLayoutItemKind.Control, key, control: config }];

    return this;
  }

  content(build: ContentBuild, cfg: FormContentCfg<M> = {}): this {
    this.items = [
      ...this.items,
      {
        kind: FormLayoutItemKind.Content,
        children: buildContent(build),
        visibleWhen: cfg.visibleWhen,
        item: itemOf(cfg),
      },
    ];

    return this;
  }

  row(build: (row: FormLayoutBuilder<M>) => void, cfg: FormRowCfg = {}): this {
    const row = new FormLayoutBuilder<M>();
    build(row);
    const grid: GridLayout = {
      ...(cfg.cols != null ? { cols: cfg.cols } : {}),
      ...(cfg.gap != null ? { gap: cfg.gap } : {}),
    };
    this.items = [
      ...this.items,
      { kind: FormLayoutItemKind.Row, grid, item: itemOf(cfg), children: row.items },
    ];

    return this;
  }

  build(): FormLayout<M> {
    return { grid: this.grid, items: this.items };
  }
}

/** Starts a layout overlay for model `M`; set the result on `FormConfig.layout`. */
export function formLayout<M extends Record<string, unknown>>(): FormLayoutBuilder<M> {
  return new FormLayoutBuilder<M>();
}
