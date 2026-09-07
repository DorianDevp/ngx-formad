import {
  ApplicationRef,
  computed,
  DestroyRef,
  EnvironmentInjector,
  inject,
  Injector,
  signal,
  WritableSignal,
} from '@angular/core';
import { form } from '@angular/forms/signals';
import { OutputEffect } from '../builders/shared-link';
import {
  buildLayoutNodes,
  buildNodes,
  ErasedUi,
  FieldConfig,
  FormConfig,
  FormLayoutContext,
  flattenFields,
  LiveUiConfig,
  RenderNode,
  RuntimeFormConfig,
} from '../form-config/form-config';
import { LayoutSpec } from '../layout/layout-adapter';
import { CONTROL_ADAPTER, LAYOUT_ADAPTER } from '../provide';
import { FormadWizard } from '../runtime/wizard-context';
import { SharedState } from '../sync/shared-state';
import { FieldLevel } from './field-tree';
import { buildLevel, disposeAll, FormLevel, ViewScope } from './form-view';

export type { FieldItems, FieldLeaf, FieldLevel } from './field-tree';
export { isItems, isLevel } from './field-tree';

/**
 * A live form: its model signal, the field tree, the authored ui, the render tree and leaves, and the view built
 * with them, formFields included. `destroy` tears the formFields down; `instantiateForm` ties that to its host.
 */
export interface FormState<
  M extends Record<string, unknown> = Record<string, unknown>,
  U extends ErasedUi = ErasedUi,
> {
  readonly model: WritableSignal<M>;

  readonly rootForm: FieldLevel;

  readonly ui: U;

  readonly nodes: readonly RenderNode[];

  readonly fields: readonly FieldConfig[];

  readonly grid?: LayoutSpec;

  readonly view: FormLevel;

  destroy(): void;
}

/** What a form is instantiated with beyond its config: the injector its formFields see, their output effects, the shared store. */
export interface InstantiateOptions {
  readonly injector?: Injector;

  readonly effects?: readonly OutputEffect[];

  readonly shared?: SharedState | null;
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
  const tree = renderTree(config);

  const injector = options.injector ?? inject(Injector);
  const shared = options.shared ?? injector.get(FormadWizard, null)?.sharedOrNull() ?? null;
  const disposers = new Set<() => void>();
  const scope: ViewScope = {
    injector,
    environment: injector.get(EnvironmentInjector),
    appRef: injector.get(ApplicationRef),
    controls: injector.get(CONTROL_ADAPTER),
    layout: injector.get(LAYOUT_ADAPTER),
    context: computed<FormLayoutContext>(() => ({ model: erased(), shared })),
    model: erased,
    effects: options.effects ?? [],
    disposers,
  };

  return {
    model,
    rootForm,
    ui: config.ui,
    ...tree,
    view: buildLevel(tree.nodes, rootForm, tree.grid ?? {}, scope),
    destroy: () => disposeAll(disposers),
  };
}

/** Builds a live form from a typed config, formFields included; runs in an injection context and goes with its host. */
export function instantiateForm<M extends Record<string, unknown>, U extends LiveUiConfig<M> & ErasedUi>(
  config: FormConfig<M, U> & RuntimeFormConfig,
): FormState<M, U> {
  const state = createState<M, U>(config, {});
  inject(DestroyRef).onDestroy(() => state.destroy());

  return state;
}

/** Builds a live form from a runtime template; runs in an injection context, and the caller owns `destroy`. */
export function instantiateRuntimeForm(config: RuntimeFormConfig, options: InstantiateOptions = {}): FormState {
  return createState<Record<string, unknown>, ErasedUi>(config, options);
}
