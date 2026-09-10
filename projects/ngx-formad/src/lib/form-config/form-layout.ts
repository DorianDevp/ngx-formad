import { ContentBuild, buildContent } from '../builders/content';
import { GridPlacement, GridLayout } from '../layout/layout-adapter';
import { FormContext, FormLayout, FormLayoutItem, FormLayoutItemKind, FieldComponentConfig } from './form-config';

/** Placement of a content block: its grid span and a gate read from the layout context. */
export interface FormContentCfg<M extends Record<string, unknown>> extends GridPlacement {
  visibleWhen?(ctx: FormContext<M>): boolean;
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

/** Arranges a form's declared fields: grid, order, placed components, prose and nested rows; `P` accumulates the components `control()` placed, by field. */
export class FormLayoutBuilder<M extends Record<string, unknown>, P extends {} = {}> {
  readonly __placed?: P;

  constructor(
    private readonly items: readonly FormLayoutItem<M>[] = [],
    private readonly grid: GridLayout = {},
    private readonly omitted: readonly string[] = [],
  ) {}

  cols(cols: GridLayout['cols']): FormLayoutBuilder<M, P> {
    return new FormLayoutBuilder<M, P>(this.items, { ...this.grid, cols }, this.omitted);
  }

  gap(gap: number): FormLayoutBuilder<M, P> {
    return new FormLayoutBuilder<M, P>(this.items, { ...this.grid, gap }, this.omitted);
  }

  /** Leaves the fields out of the view on purpose, so the dev-mode warning about unplaced fields stays quiet about them. */
  omit(...keys: (keyof M & string)[]): FormLayoutBuilder<M, P> {
    return new FormLayoutBuilder<M, P>(this.items, this.grid, [...this.omitted, ...keys]);
  }

  field(key: keyof M & string, item?: GridPlacement): FormLayoutBuilder<M, P> {
    return this.with({ kind: FormLayoutItemKind.Field, key, item });
  }

  fields(...keys: (keyof M & string)[]): FormLayoutBuilder<M, P> {
    return new FormLayoutBuilder<M, P>(
      [...this.items, ...keys.map((key) => ({ kind: FormLayoutItemKind.Field, key }) as const)],
      this.grid,
      this.omitted,
    );
  }

  /** Draws the field with a component of your own, one that edits the field's value type; what it is bound with is declared where the form is instantiated. */
  control<K extends keyof M & string, C extends object>(
    key: K,
    config: FieldComponentConfig<M[K], C>,
  ): FormLayoutBuilder<M, P & Record<K, C>> {
    return new FormLayoutBuilder<M, P & Record<K, C>>(
      [...this.items, { kind: FormLayoutItemKind.Control, key, control: config }],
      this.grid,
      this.omitted,
    );
  }

  content(build: ContentBuild, cfg: FormContentCfg<M> = {}): FormLayoutBuilder<M, P> {
    return this.with({
      kind: FormLayoutItemKind.Content,
      children: buildContent(build),
      visibleWhen: cfg.visibleWhen,
      item: itemOf(cfg),
    });
  }

  row<P2 extends {}>(
    build: (row: FormLayoutBuilder<M, {}>) => FormLayoutBuilder<M, P2>,
    cfg: FormRowCfg = {},
  ): FormLayoutBuilder<M, P & P2> {
    const row = build(new FormLayoutBuilder<M, {}>());
    const grid: GridLayout = {
      ...(cfg.cols != null ? { cols: cfg.cols } : {}),
      ...(cfg.gap != null ? { gap: cfg.gap } : {}),
    };

    return new FormLayoutBuilder<M, P & P2>(
      [...this.items, { kind: FormLayoutItemKind.Row, grid, item: itemOf(cfg), children: row.items }],
      this.grid,
      this.omitted,
    );
  }

  build(): FormLayout<M, P> {
    return { grid: this.grid, items: this.items, omitted: this.omitted };
  }

  private with(item: FormLayoutItem<M>): FormLayoutBuilder<M, P> {
    return new FormLayoutBuilder<M, P>([...this.items, item], this.grid, this.omitted);
  }
}

/** Starts a layout overlay for model `M`; set the result on `FormConfig.layout`. */
export function formLayout<M extends Record<string, unknown>>(): FormLayoutBuilder<M> {
  return new FormLayoutBuilder<M>();
}
