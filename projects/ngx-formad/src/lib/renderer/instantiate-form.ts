import {
  computed,
  effect,
  EnvironmentInjector,
  inject,
  Injector,
  isDevMode,
  signal,
  untracked,
  WritableSignal,
} from '@angular/core';
import { form } from '@angular/forms/signals';
import { BindingRecord, FormBindings, FormContext, FormEffect, FormEffectHook } from '../form-config/form-bindings';
import {
  buildLayoutNodes,
  buildNodes,
  ErasedUi,
  FieldConfig,
  FormConfig,
  FormLayout,
  FormLayoutContext,
  FormLayoutItem,
  FormLayoutItemKind,
  flattenFields,
  LiveUiConfig,
  PlacesCustomFields,
  RenderNode,
  RuntimeFormConfig,
} from '../form-config/form-config';
import { Live, read } from '../form-config/live';
import { GridLayout } from '../layout/layout-adapter';
import { CONTROL_ADAPTER, LAYOUT_ADAPTER } from '../provide';
import { FormadWizard } from '../runtime/wizard-context';
import { SharedState } from '../sync/shared-state';
import { FieldLevel } from './field-tree';
import { buildLevel, FormLevel, ViewScope } from './form-view';

export type { FieldItems, FieldLeaf, FieldLevel } from './field-tree';
export { isItems, isLevel } from './field-tree';

/** A live form: its model signal, the field tree, the authored ui, the render tree and leaves, and the view built over them. */
export interface FormState<
  M extends Record<string, unknown> = Record<string, unknown>,
  U extends ErasedUi = ErasedUi,
> {
  readonly model: WritableSignal<M>;

  readonly rootForm: FieldLevel;

  readonly ui: U;

  readonly nodes: readonly RenderNode[];

  readonly fields: readonly FieldConfig[];

  readonly grid?: GridLayout;

  readonly view: FormLevel;

  /** Ends the form's effects; a host whose injector outlives the instance calls it when the instance goes. */
  destroy(): void;
}

/** What a form is instantiated with beyond its config: the injector its formFields see, the shared store, its bindings and effects, and the context they read. */
export interface InstantiateOptions {
  readonly injector?: Injector;

  readonly shared?: SharedState | null;

  readonly bindings?: BindingRecord;

  readonly effects?: readonly FormEffectHook[];

  /** What a handler and an effect read beside the model; a getter is read again on every call, so a step context stays live. */
  readonly context?: Live<object>;
}

const warnedLayouts = new WeakSet<FormLayout>();

function placedKeys(items: readonly FormLayoutItem[]): string[] {
  return items.flatMap((item) => {
    if (item.kind === FormLayoutItemKind.Row) return placedKeys(item.children);

    return 'key' in item ? [item.key] : [];
  });
}

/** Says once per layout, in dev mode, which fields of the ui the overlay neither places nor omits on purpose. */
function warnUnplaced(config: RuntimeFormConfig): void {
  const layout = config.layout;
  if (!layout || !isDevMode() || warnedLayouts.has(layout)) return;

  warnedLayouts.add(layout);
  const placed = new Set([...placedKeys(layout.items), ...(layout.omitted ?? [])]);
  const unplaced = Object.keys(config.ui).filter((key) => !placed.has(key));
  if (unplaced.length === 0) return;

  const names = unplaced.map((key) => `"${key}"`).join(', ');
  console.warn(`ngx-formad: the layout leaves ${names} unplaced; place the field, or omit() it on purpose.`);
}

function renderTree(config: RuntimeFormConfig): Pick<FormState, 'nodes' | 'fields' | 'grid'> {
  const items = config.layout?.items;

  return {
    nodes: items ? buildLayoutNodes(config.ui, items) : buildNodes(config.ui),
    fields: flattenFields(config.ui),
    grid: config.layout?.grid,
  };
}

/** Builds the state over the erased template; the typed `model` and `ui` ride along under `M` and `U`. */
function createState<M extends Record<string, unknown>, U extends ErasedUi>(
  config: { model(): M; readonly ui: U } & RuntimeFormConfig,
  options: InstantiateOptions,
): FormState<M, U> {
  const model = signal(config.model());
  const erased: WritableSignal<Record<string, unknown>> = model;
  const schema = config.schema;
  const rootForm: FieldLevel = schema ? form(erased, schema) : form(erased);
  warnUnplaced(config);
  const tree = renderTree(config);

  const injector = options.injector ?? inject(Injector);
  const shared = options.shared ?? injector.get(FormadWizard, null)?.sharedOrNull() ?? null;
  const handlerContext = (): FormContext => ({ ...read(options.context ?? {}), model: erased });
  const scope: ViewScope = {
    injector,
    environment: injector.get(EnvironmentInjector),
    controls: injector.get(CONTROL_ADAPTER),
    layout: injector.get(LAYOUT_ADAPTER),
    context: computed<FormLayoutContext>(() => ({ model: erased(), shared })),
    model: erased,
    bindings: options.bindings ?? {},
    handlerContext,
  };
  const effects = (options.effects ?? []).map((hook) =>
    effect(() => hook.run(untracked(handlerContext)), { injector }),
  );

  return {
    model,
    rootForm,
    ui: config.ui,
    ...tree,
    view: buildLevel(tree.nodes, rootForm, tree.grid ?? {}, scope),
    destroy: () => {
      for (const ref of effects) ref.destroy();
    },
  };
}

/** Builds a live form from a typed config, with its bindings and effects; runs in an injection context. */
export function instantiateForm<M extends Record<string, unknown>, U extends LiveUiConfig<M> & ErasedUi, P extends {} = {}>(
  config: FormConfig<M, U, P> & RuntimeFormConfig & PlacesCustomFields<U, P>,
  bindings: NoInfer<FormBindings<M, U, P, FormContext<M>>> | null = null,
  effects: readonly FormEffect<FormContext<M>>[] = [],
): FormState<M, U> {
  return createState<M, U>(config, { bindings: bindings ?? {}, effects: effects.map((run) => ({ run })) });
}

/** Builds a live form from a runtime template; runs in an injection context. */
export function instantiateRuntimeForm(config: RuntimeFormConfig, options: InstantiateOptions = {}): FormState {
  return createState<Record<string, unknown>, ErasedUi>(config, options);
}
