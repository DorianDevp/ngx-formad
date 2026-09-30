import { effect, EnvironmentInjector, inject, Injector, isDevMode, isSignal, signal, untracked, WritableSignal } from '@angular/core';
import { form } from '@angular/forms/signals';
import { CONTROL_ADAPTER } from '../controls';
import { LAYOUT_ADAPTER } from '../layout';
import { SHARED_STATE } from '../shared';
import { buildLevel } from './form-view';
import { LazyFormState } from './lazy-form-state';
import { buildLayoutNodes, buildNodes, flattenFields } from './render-tree';
import { FieldLevel } from './types/field-tree';
import { FormBindings, FormEffect } from './types/form-bindings';
import { FormConfig, FormModelSource, PlacesCustomFields, RuntimeFormConfig } from './types/form-config';
import { FormContext } from './types/form-context';
import { FormLayout, FormLayoutItem, FormLayoutItemKind } from './types/form-layout';
import { FormState, InstantiateOptions } from './types/form-state';
import { ViewScope } from './types/form-view';
import { ErasedUi, SignalUiConfig } from './types/ui-nodes';

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

/**
 * Takes the model and the injector at once and builds the rest now, or - over a signal of the author's own, which may
 * read an input not set yet - on the state's first read. The typed `model` and `ui` ride along under `M` and `U`.
 */
function createState<M extends Record<string, unknown>, U extends ErasedUi>(
  config: { readonly model: FormModelSource<M>; readonly ui: U } & RuntimeFormConfig,
  options: InstantiateOptions,
): FormState<M, U> {
  const source: FormModelSource<M> = config.model;
  const made = isSignal(source) ? source : source();
  const scoped = { ...options, injector: options.injector ?? inject(Injector) };
  if (!isSignal(made)) return buildState(signal(made), config, scoped);

  return new LazyFormState(made, config.ui, () => buildState(made, config, scoped));
}

/** Builds the state over the erased template and the model; no injection context needed, the injector is in hand. */
function buildState<M extends Record<string, unknown>, U extends ErasedUi>(
  model: WritableSignal<M>,
  config: { readonly ui: U } & RuntimeFormConfig,
  options: InstantiateOptions & { readonly injector: Injector },
): FormState<M, U> {
  const erased: WritableSignal<Record<string, unknown>> = model;
  const schema = config.schema;
  const injector = options.injector;
  const rootForm: FieldLevel = schema ? form(erased, schema, { injector }) : form(erased, { injector });
  warnUnplaced(config);
  const tree = renderTree(config);

  const shared = options.shared ?? injector.get(SHARED_STATE, null) ?? null;
  const formContext: FormContext = { model: erased, ui: config.ui, fields: tree.fields };
  const handlerContext = (): FormContext => ({ ...(options.context?.() ?? {}), ...formContext });
  const scope: ViewScope = {
    injector,
    environment: injector.get(EnvironmentInjector),
    controls: injector.get(CONTROL_ADAPTER),
    layout: injector.get(LAYOUT_ADAPTER),
    context: formContext,
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

/**
 * Builds a live form over a model signal of your own - `model` a signal, or a factory returning one, a `linkedSignal`
 * over an input, say - with its bindings and effects; called in an injection context.
 *
 * **Lazy.** Only `model` and `ui` are there at once; the field tree, the view, the formFields' mounts and the effects are
 * built on the first read of anything else, `view` in the renderer's template as a rule. So a component may
 * instantiate it in a field initializer over an `input.required`, which has no value until the inputs are set - as
 * long as nothing reads `rootForm`, `view`, `nodes`, `fields` or `grid` before then. A config error (a field the model
 * lacks) surfaces at that first read, and the effects start there.
 */
export function instantiateForm<M extends Record<string, unknown>, U extends SignalUiConfig<M> & ErasedUi, P extends {} = {}>(
  config: FormConfig<M, U, P> &
    RuntimeFormConfig & { readonly model: WritableSignal<M> | (() => WritableSignal<M>) } & PlacesCustomFields<U, P>,
  bindings?: NoInfer<FormBindings<M, U, P, FormContext<M>>> | null,
  effects?: readonly FormEffect<FormContext<M>>[],
): FormState<M, U>;
/** Builds a live form from a typed config, with its bindings and effects, all at once; runs in an injection context. */
export function instantiateForm<M extends Record<string, unknown>, U extends SignalUiConfig<M> & ErasedUi, P extends {} = {}>(
  config: FormConfig<M, U, P> & RuntimeFormConfig & PlacesCustomFields<U, P>,
  bindings?: NoInfer<FormBindings<M, U, P, FormContext<M>>> | null,
  effects?: readonly FormEffect<FormContext<M>>[],
): FormState<M, U>;
export function instantiateForm<M extends Record<string, unknown>, U extends SignalUiConfig<M> & ErasedUi, P extends {} = {}>(
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
