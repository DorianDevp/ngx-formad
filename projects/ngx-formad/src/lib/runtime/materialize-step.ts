import { computed, EnvironmentInjector, runInInjectionContext, Signal } from '@angular/core';
import { ValidationError } from '@angular/forms/signals';
import { CUSTOM_FIELD, isGetter } from 'formodel';
import { FormNode, LayoutNode, LayoutNodeKind, PageNode } from '../builders/nodes';
import { AnyFormProvider, RuntimeStepContext } from '../builders/step-context';
import { RuntimeFormConfig } from '../form-config/form-config';
import { FieldLeaf, FieldLevel, FormState, instantiateRuntimeForm, isLevel } from '../renderer/instantiate-form';
import { BoundOutputEffect } from '../renderer/output-effect';
import { InstanceRegistry } from '../registry/instance-registry';
import { SharedState } from '../sync/shared-state';

/** One blocker shown when Next is refused: the field's label and the message. */
export interface StepIssue {
  readonly label: string;

  readonly message: string;
}

/** One placed form turned live: its state, effects, visibility, issues and the seed/commit/touch actions. */
export interface LiveForm {
  readonly name: string;

  readonly state: FormState;

  readonly effects: readonly BoundOutputEffect[];

  readonly visible: Signal<boolean>;

  readonly issues: Signal<readonly StepIssue[]>;

  seed(): void;

  commit(): void;

  touch(): void;
}

/** A step turned live: its registry, forms, environment, instances by pool name and resolved pages. */
export interface LiveStep {
  readonly registry: InstanceRegistry;

  readonly forms: readonly LiveForm[];

  readonly environment: EnvironmentInjector;

  readonly instances: Readonly<Record<string, FormState>>;

  readonly pages: readonly PageNode[];
}

/** The form nodes the pages place, in order, rows included. */
export function formNodes(pages: readonly PageNode[]): FormNode[] {
  const walk = (nodes: readonly LayoutNode[]): FormNode[] =>
    nodes.flatMap((node) => {
      if (node.kind === LayoutNodeKind.Form) return [node];

      return node.kind === LayoutNodeKind.Row ? walk(node.children) : [];
    });

  return pages.flatMap((page) => walk(page.children));
}

function fieldAt(root: FieldLevel, path: readonly string[]): FieldLeaf {
  let node: FieldLeaf = root;
  for (const segment of path) {
    if (!isLevel(node)) throw new Error(`ngx-formad: "${segment}" sits under a field that is not an object.`);

    const child = node[segment];
    if (child === undefined) throw new Error(`ngx-formad: the form model has no field "${segment}".`);

    node = child;
  }

  return node;
}

function issueMessage(error: ValidationError): string {
  if (error.message) return error.message;

  return error.kind === 'required' ? 'This field is required.' : 'Invalid value.';
}

function issueLabel(error: ValidationError.WithFieldTree, state: FormState): string {
  const field = state.fields.find((candidate) => fieldAt(state.rootForm, candidate.path) === error.fieldTree);
  if (!field) return String(error.fieldTree().keyInParent());
  if ('props' in field.node || field.node.type === CUSTOM_FIELD) return field.key;

  const label = field.node.label;
  if (label === undefined) return field.key;

  return isGetter(label) ? label() : label;
}

/** What a step materializes against: the resolved templates, the shared store, the flow environment and the entry context. */
export interface MaterializeOptions {
  readonly pool: Record<string, RuntimeFormConfig>;

  readonly shared: SharedState;

  readonly environment: EnvironmentInjector;

  readonly entry: RuntimeStepContext;
}

function liveForm(node: FormNode, options: MaterializeOptions): LiveForm | null {
  const template = options.pool[node.name];
  if (!template) return null;

  const seed = node.initial?.(options.entry);
  const config = seed ? { ...template, model: () => ({ ...template.model(), ...seed }) } : template;
  const state = runInInjectionContext(options.environment, () => instantiateRuntimeForm(config));
  const root = state.rootForm;
  const visible: Signal<boolean> = node.visibleWhen ? computed(node.visibleWhen) : computed(() => true);
  const effects: BoundOutputEffect[] = node.effects.map((effect) => ({
    path: effect.modelPath,
    output: effect.output,
    run: (payload) => effect.handler(payload, state.model),
  }));
  const issues = computed<readonly StepIssue[]>(() =>
    root()
      .errorSummary()
      .map((error) => ({ label: issueLabel(error, state), message: issueMessage(error) })),
  );

  return {
    name: node.name,
    state,
    effects,
    visible,
    issues,
    seed: () => {
      for (const link of node.links) {
        const field = fieldAt(root, link.modelPath)();
        if (field.dirty()) continue;

        field.value.set(options.shared.get(link.sharedKey));
      }
    },
    commit: () => {
      for (const link of node.links) {
        const field = fieldAt(root, link.modelPath)();
        options.shared.patch({ [link.sharedKey]: field.value() });
      }
    },
    touch: () => {
      for (const field of state.fields) fieldAt(root, field.path)().markAsTouched();
    },
  };
}

/** Instantiates a step's placed forms, registers them for completion and wires their shared links. */
export function materializeStep(pages: readonly PageNode[], options: MaterializeOptions): LiveStep {
  const registry = new InstanceRegistry();
  const forms = formNodes(pages).flatMap((node) => {
    const live = liveForm(node, options);

    return live === null ? [] : [live];
  });
  for (const form of forms) {
    registry.add({ rootForm: form.state.rootForm, visible: form.visible });
    form.seed();
  }

  return {
    registry,
    forms,
    environment: options.environment,
    instances: Object.fromEntries(forms.map((form) => [form.name, form.state])),
    pages,
  };
}

/** Resolves the templates the pages place: loaders are awaited, configs pass through. */
export async function resolveStepForms(
  pages: readonly PageNode[],
  pool: Record<string, AnyFormProvider>,
): Promise<Record<string, RuntimeFormConfig>> {
  const entries = await Promise.all(
    formNodes(pages).map(async (node) => {
      const entry = pool[node.name];
      if (!entry) return null;

      const config = typeof entry === 'function' ? await entry() : entry;

      return [node.name, config] as const;
    }),
  );

  return Object.fromEntries(entries.flatMap((entry) => (entry === null ? [] : [entry])));
}
