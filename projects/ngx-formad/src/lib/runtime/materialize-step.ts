import { computed, EnvironmentInjector, runInInjectionContext, Signal } from '@angular/core';
import { FieldState, FieldTree, ValidationError } from '@angular/forms/signals';
import { CUSTOM_FIELD } from 'formodel';
import { AnyFormProvider, RuntimeStepContext, RuntimeStepInstance } from '../builders/step-context';
import { FormConfig } from '../form-config/form-config';
import { readReactive } from '../form-config/reactive';
import { FormState, instantiateForm } from '../renderer/instantiate-form';
import { BoundOutputEffect } from '../renderer/output-effect';
import { FormNode, LayoutNode, PageNode, StepNode } from '../builders/nodes';
import { InstanceRegistry } from '../registry/instance-registry';
import { commitToShared, seedFromShared } from '../sync/directional-sync';
import { fieldSync } from '../sync/field-sync';
import { SharedState } from '../sync/shared-state';

export interface StepIssue {
  readonly label: string;

  readonly message: string;
}

export interface LiveForm {
  readonly name: string;

  readonly state: FormState<Record<string, unknown>>;

  readonly effects: readonly BoundOutputEffect[];

  readonly visible: Signal<boolean>;

  readonly issues: Signal<readonly StepIssue[]>;

  seed(): void;

  commit(): void;

  touch(): void;
}

export interface LiveStep {
  readonly registry: InstanceRegistry;

  readonly forms: readonly LiveForm[];

  readonly environment: EnvironmentInjector;

  readonly instances: RuntimeStepInstance;

  readonly pages: readonly PageNode[];
}

export function resolvePages(step: StepNode, ctx: RuntimeStepContext): readonly PageNode[] {
  return typeof step.pages === 'function' ? step.pages(ctx) : step.pages;
}

export function stepFormNames(pages: readonly PageNode[]): readonly string[] {
  return formNodes(pages).map((node) => node.name);
}

function fieldAt(
  root: Record<string, FieldTree<unknown>>,
  path: readonly string[],
): FieldTree<unknown> {
  let node = root[path[0]];
  for (let i = 1; i < path.length; i++) {
    node = (node as unknown as Record<string, FieldTree<unknown>>)[path[i]];
  }
  return node;
}

function formNodes(pages: readonly PageNode[]): FormNode[] {
  const found: FormNode[] = [];
  const walk = (nodes: readonly LayoutNode[]) => {
    for (const node of nodes) {
      if (node.kind === 'form') found.push(node);
      else if (node.kind === 'row') walk(node.children);
    }
  };
  for (const page of pages) walk(page.children);
  return found;
}

function issueMessage(error: ValidationError): string {
  if (error.message) return error.message;
  return error.kind === 'required' ? 'This field is required.' : 'Invalid value.';
}

function issueLabel(
  error: ValidationError.WithFieldTree,
  fields: FormState<Record<string, unknown>>['fields'],
  root: Record<string, FieldTree<unknown>>,
): string {
  for (const field of fields) {
    if (fieldAt(root, field.path) !== error.fieldTree) continue;
    if (field.node.type === CUSTOM_FIELD) return field.key;

    return readReactive(field.node.label) ?? field.key;
  }
  return String((error.fieldTree() as FieldState<unknown>).keyInParent());
}

export function materializeStep(
  pages: readonly PageNode[],
  pool: Record<string, FormConfig<Record<string, unknown>>>,
  shared: SharedState<Record<string, unknown>>,
  environment: EnvironmentInjector,
  entry: RuntimeStepContext,
): LiveStep {
  const registry = new InstanceRegistry();
  const forms: LiveForm[] = [];
  const instances: Record<string, unknown> = {};

  for (const node of formNodes(pages)) {
    const template = pool[node.name];
    if (!template) continue;

    const config = node.initial ? seeded(template, node.initial(entry)) : template;
    const state = runInInjectionContext(environment, () => instantiateForm(config));
    instances[node.name] = state;
    const rootTree = state.rootForm as unknown as FieldTree<unknown>;
    const root = state.rootForm as unknown as Record<string, FieldTree<unknown>>;

    const visible: Signal<boolean> = node.visibleWhen
      ? computed(node.visibleWhen)
      : computed(() => true);

    registry.add({ rootForm: rootTree, visible });

    const seed = () => {
      for (const link of node.links) {
        seedFromShared(fieldSync(fieldAt(root, link.modelPath)), shared.slot(link.sharedKey));
      }
    };
    const commit = () => {
      for (const link of node.links) {
        commitToShared(fieldSync(fieldAt(root, link.modelPath)), shared.slot(link.sharedKey));
      }
    };

    const effects: BoundOutputEffect[] = node.effects.map((effect) => ({
      path: effect.modelPath,
      output: effect.output,
      run: (payload: unknown) => effect.handler(payload, state.model),
    }));

    const issues = computed<readonly StepIssue[]>(() =>
      (rootTree() as FieldState<unknown>)
        .errorSummary()
        .map((error) => ({ label: issueLabel(error, state.fields, root), message: issueMessage(error) })),
    );

    seed();
    forms.push({
      name: node.name,
      state,
      effects,
      visible,
      issues,
      seed,
      commit,
      touch: () => {
        for (const field of state.fields) {
          (fieldAt(root, field.path)() as FieldState<unknown>).markAsTouched();
        }
      },
    });
  }

  return { registry, forms, environment, instances, pages };
}

function seeded(
  template: FormConfig<Record<string, unknown>>,
  seed: Partial<Record<string, unknown>>,
): FormConfig<Record<string, unknown>> {
  return { ...template, model: () => ({ ...template.model(), ...seed }) };
}

export async function resolveStepForms(
  pages: readonly PageNode[],
  pool: Record<string, AnyFormProvider>,
): Promise<Record<string, FormConfig<Record<string, unknown>>>> {
  const entries = await Promise.all(
    formNodes(pages).map(async (node) => {
      const entry = pool[node.name];
      if (!entry) return null;
      const config =
        typeof entry === 'function'
          ? await entry()
          : (entry as FormConfig<Record<string, unknown>>);
      return [node.name, config] as const;
    }),
  );

  const resolved: Record<string, FormConfig<Record<string, unknown>>> = {};
  for (const entry of entries) {
    if (entry) resolved[entry[0]] = entry[1];
  }
  return resolved;
}
