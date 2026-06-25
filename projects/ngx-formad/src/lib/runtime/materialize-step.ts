import { computed, Injector, runInInjectionContext, Signal } from '@angular/core';
import { FieldTree } from '@angular/forms/signals';
import { AnyFormProvider } from '../builders/step-context';
import { FormConfig } from '../form-config/form-config';
import { FormState, instantiateForm } from '../renderer/instantiate-form';
import { BoundOutputEffect } from '../renderer/output-effect';
import { FormNode, LayoutNode, PageNode, StepNode } from '../builders/nodes';
import { InstanceRegistry } from '../registry/instance-registry';
import { commitToShared, seedFromShared } from '../sync/directional-sync';
import { fieldSync } from '../sync/field-sync';
import { SharedState } from '../sync/shared-state';

// Turning a step's config into live forms is where lifecycle, registry, and sync
// meet. It happens here, not in the builder: `form()` is reactive and needs an
// injection context, and a step is reached from a navigation event — not a
// reactive context — so `runInInjectionContext` is the right and sufficient
// wrapper. Each materialized form joins the step's registry (so completion folds
// it) and carries its own seed/commit for the directional sync.

/** A live form within a step, with the two directional-sync triggers and its
 *  control-output effects (handlers bound to this form's live model). */
export interface LiveForm {
  readonly name: string;
  readonly state: FormState<Record<string, unknown>>;
  readonly effects: readonly BoundOutputEffect[];
  /** shared -> field for every link, run on entry; seeds only pristine fields. */
  seed(): void;
  /** field -> shared for every link, run on a commit (blur / submit). */
  commit(): void;
}

/** The live result of materializing a step. */
export interface LiveStep {
  readonly registry: InstanceRegistry;
  readonly forms: readonly LiveForm[];
  /** The step's page tree, retained so a chrome can render the full layout —
   *  forms *and* dynamic components, rows, and content slots — in place, not just
   *  the flat form list. Forms are resolved back to their live state by name. */
  readonly pages: readonly PageNode[];
}

/** The names of every form a step references, depth-first. Lets a host check for
 *  lazy forms (and take a synchronous path when there are none). */
export function stepFormNames(step: StepNode): readonly string[] {
  return formNodes(step).map((node) => node.name);
}

// Walks a field tree to the node at `path` — `['nip']` for a top-level field,
// `['address','city']` for a nested one. `FieldTree` is indexable by child key.
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

// Forms can be nested in rows, so gather them depth-first across the step.
function formNodes(step: StepNode): FormNode[] {
  const found: FormNode[] = [];
  const walk = (nodes: readonly LayoutNode[]) => {
    for (const node of nodes) {
      if (node.kind === 'form') found.push(node);
      else if (node.kind === 'row') walk(node.children);
    }
  };
  for (const page of step.pages) walk(page.children);
  return found;
}

/** Instantiates a step's forms, registers them, and wires their shared links. */
export function materializeStep(
  step: StepNode,
  pool: Record<string, FormConfig<Record<string, unknown>>>,
  shared: SharedState<Record<string, unknown>>,
  injector: Injector,
): LiveStep {
  const registry = new InstanceRegistry();
  const forms: LiveForm[] = [];

  for (const node of formNodes(step)) {
    const config = pool[node.name];
    if (!config) continue;

    const state = runInInjectionContext(injector, () => instantiateForm(config));
    const root = state.rootForm as unknown as Record<string, FieldTree<unknown>>;

    const visible: Signal<boolean> = node.visibleWhen
      ? computed(node.visibleWhen)
      : computed(() => true);

    registry.add({ rootForm: state.rootForm as unknown as FieldTree<unknown>, visible });

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

    // Each recorded effect, with its handler bound to this form's live model.
    const effects: BoundOutputEffect[] = node.effects.map((effect) => ({
      path: effect.modelPath,
      output: effect.output,
      run: (payload: unknown) => effect.handler(payload, state.model),
    }));

    // Seed once on materialization — that is this form's entry.
    seed();
    forms.push({ name: node.name, state, effects, seed, commit });
  }

  return { registry, forms, pages: step.pages };
}

/**
 * Resolves a step's forms ahead of materialization, awaiting any lazy loaders so
 * the sync `materializeStep` above can consume a plain config map. Eager configs
 * pass straight through; only steps with lazily-declared forms incur a `Promise`.
 */
export async function resolveStepForms(
  step: StepNode,
  pool: Record<string, AnyFormProvider>,
): Promise<Record<string, FormConfig<Record<string, unknown>>>> {
  const resolved: Record<string, FormConfig<Record<string, unknown>>> = {};
  for (const node of formNodes(step)) {
    const entry = pool[node.name];
    if (!entry) continue;
    // A config is an object; a loader is a function — that is the discriminator.
    resolved[node.name] =
      typeof entry === 'function'
        ? await entry()
        : (entry as FormConfig<Record<string, unknown>>);
  }
  return resolved;
}
