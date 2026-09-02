import { Type } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { ContentBuild, buildContent } from '../builders/content';
import { InputKeys, InputVal } from '../builders/dynamic-component';
import { ErasedRecord, ErasedValue, Rejected } from '../builders/step-context';
import { ItemSpec, LayoutSpec } from '../layout/layout-adapter';
import {
  ControlInput,
  FormLayout,
  FormLayoutContext,
  FormLayoutItem,
  FormLayoutItemKind,
} from './form-config';

/** The value type a `FormValueControl` component binds. */
export type ControlValue<C> = C extends FormValueControl<infer V> ? V : never;

/** `object` when field value `V` fits control `C`; a refusal naming the mismatch otherwise. */
export type ValueFits<V, C> = V extends ControlValue<C>
  ? object
  : Rejected<'the control value type does not fit the field type'>;

/** The inputs `FormField` binds itself; `control()` refuses them. */
export type FormFieldManaged = keyof FormValueControl<ErasedValue>;

type PresentationalKeys<C> = InputKeys<Omit<C, FormFieldManaged>>;

/** The inputs `control()` may bind: every presentational input, static or read from the layout context. */
export type ControlInputsCfg<C, M extends ErasedRecord> = {
  readonly [K in PresentationalKeys<C>]?: ControlInput<InputVal<C, K>, M>;
} & {
  readonly [K in Exclude<keyof C, PresentationalKeys<C>>]?: Rejected<'this input is bound by FormField, not by control()'>;
};

/** A control placed with its inputs and grid placement. */
export interface FormControlCfg<C, M extends ErasedRecord> extends ItemSpec {
  readonly component: Type<C>;

  readonly inputs?: ControlInputsCfg<C, M>;
}

/** What `control()` takes for a field of value `V`: the component class alone, or a config naming it. */
export type FormControlSpec<V, C, M extends ErasedRecord> =
  | (Type<C> & ValueFits<V, C>)
  | (FormControlCfg<C, M> & { readonly component: Type<C> & ValueFits<V, C> });

/** Placement of a content block: its grid span and a gate read from the layout context. */
export interface FormContentCfg<M extends ErasedRecord> extends ItemSpec {
  readonly visibleWhen?: (ctx: FormLayoutContext<M>) => boolean;
}

/** A row's own grid plus its placement in the parent grid. */
export interface FormRowCfg extends LayoutSpec, ItemSpec {}

function itemOf(cfg: ItemSpec): ItemSpec | undefined {
  const item: ItemSpec = {
    ...(cfg.colSpan != null ? { colSpan: cfg.colSpan } : {}),
    ...(cfg.colStart != null ? { colStart: cfg.colStart } : {}),
  };

  return Object.keys(item).length ? item : undefined;
}

/** Arranges a form's declared fields: grid, order, per-field controls, prose and nested rows. */
export class FormLayoutBuilder<M extends ErasedRecord> {
  private items: readonly FormLayoutItem<M>[] = [];

  private grid: LayoutSpec = {};

  cols(cols: LayoutSpec['cols']): this {
    this.grid = { ...this.grid, cols };

    return this;
  }

  gap(gap: number): this {
    this.grid = { ...this.grid, gap };

    return this;
  }

  field(key: keyof M & string, item?: ItemSpec): this {
    this.items = [...this.items, { kind: FormLayoutItemKind.Field, key, item }];

    return this;
  }

  fields(...keys: (keyof M & string)[]): this {
    this.items = [...this.items, ...keys.map((key) => ({ kind: FormLayoutItemKind.Field, key }) as const)];

    return this;
  }

  control<K extends keyof M & string, C extends object>(key: K, spec: FormControlSpec<M[K], C, M>): this {
    const cfg = typeof spec === 'function' ? { component: spec } : spec;
    const inputs: Readonly<Record<string, ControlInput<ErasedValue, M>>> = cfg.inputs ?? {};
    this.items = [
      ...this.items,
      {
        kind: FormLayoutItemKind.Control,
        key,
        control: { component: cfg.component, inputs },
        item: itemOf(cfg),
      },
    ];

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
    const grid: LayoutSpec = {
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
export function formLayout<M extends ErasedRecord>(): FormLayoutBuilder<M> {
  return new FormLayoutBuilder<M>();
}
