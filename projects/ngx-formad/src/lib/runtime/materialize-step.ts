import { Binding, computed, Injector, runInInjectionContext, signal, Signal, Type } from '@angular/core';
import {
  FieldState,
  FieldTree,
  form,
  validateStandardSchema,
  ValidationError,
} from '@angular/forms/signals';
import {
  AnyControlEntry,
  AnyFormProvider,
  isContextualForm,
  RuntimeStepContext,
} from '../builders/step-context';
import { FormConfig } from '../form-config/form-config';
import { readReactive } from '../form-config/reactive';
import { FormState, instantiateForm } from '../renderer/instantiate-form';
import { BoundOutputEffect } from '../renderer/output-effect';
import { FormNode, LayoutNode, PageNode, StepNode, ValueControlNode } from '../builders/nodes';
import { InstanceRegistry } from '../registry/instance-registry';
import { commitToShared, seedFromShared } from '../sync/directional-sync';
import { fieldSync } from '../sync/field-sync';
import { SharedState } from '../sync/shared-state';

// Turning a step's config into live forms is where lifecycle, registry, and sync
// meet. It happens here, not in the builder: `form()` is reactive and needs an
// injection context, and a step is reached from a navigation event — not a
// reactive context — so `runInInjectionContext` is the right and sufficient
// wrapper. Each materialized form joins the step's registry (so completion folds
// it) and carries its own seed/commit for the directional sync. A standalone
// control goes through the same lifecycle wearing an implicit single-value field
// tree — one pipeline, two shapes.

/** One human-readable reason a step's gate is closed — an invalid field or
 *  control, labeled so a chrome can show *why* Next refuses, not just that it
 *  does. */
export interface StepIssue {
  /** The field's label (or a control's declared label / pool name). */
  readonly label: string;
  readonly message: string;
}

/** A live form within a step, with the two directional-sync triggers and its
 *  control-output effects (handlers bound to this form's live model). */
export interface LiveForm {
  readonly name: string;
  readonly state: FormState<Record<string, unknown>>;
  readonly effects: readonly BoundOutputEffect[];
  /** The node's `visibleWhen` fold — the same signal the registry counts. */
  readonly visible: Signal<boolean>;
  /** Every current validation error, labeled for display. */
  readonly issues: Signal<readonly StepIssue[]>;
  /** shared -> field for every link, run on entry; seeds only pristine fields. */
  seed(): void;
  /** field -> shared for every link, run on a commit (blur / submit). */
  commit(): void;
  /** Marks every field touched, so controls surface their own errors — run on a
   *  blocked Next, when the user has asked "why not?". */
  touch(): void;
}

/** A live standalone control: a `FormValueControl` component's implicit
 *  single-value field tree, registered for completion and synced like a form. */
export interface LiveControl {
  readonly name: string;
  readonly component: Type<unknown>;
  /** Presentational bindings from `addControl`; the value binding is the
   *  renderer's (`FormField` on `field`). */
  readonly bindings: readonly Binding[];
  readonly layout?: string;
  /** The implicit field tree holding the control's value. */
  readonly field: FieldTree<unknown>;
  readonly label: string;
  readonly visible: Signal<boolean>;
  readonly issues: Signal<readonly StepIssue[]>;
  /** The current raw value — what commits under the control's pool name. */
  value(): unknown;
  seed(): void;
  commit(): void;
  touch(): void;
}

/** The live result of materializing a step. */
export interface LiveStep {
  readonly registry: InstanceRegistry;
  readonly forms: readonly LiveForm[];
  readonly controls: readonly LiveControl[];
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

// Walks a field tree to the node at `path` — `['taxId']` for a top-level field,
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

// Forms and controls can be nested in rows, so gather them depth-first.
function nodesOfKind<N extends LayoutNode>(step: StepNode, kind: N['kind']): N[] {
  const found: N[] = [];
  const walk = (nodes: readonly LayoutNode[]) => {
    for (const node of nodes) {
      if (node.kind === kind) found.push(node as N);
      else if (node.kind === 'row') walk(node.children);
    }
  };
  for (const page of step.pages) walk(page.children);
  return found;
}

const formNodes = (step: StepNode): FormNode[] => nodesOfKind<FormNode>(step, 'form');
const controlNodes = (step: StepNode): ValueControlNode[] =>
  nodesOfKind<ValueControlNode>(step, 'control');

// An error's display text: its own message when it has one, otherwise the two
// kinds worth special-casing get plain English and the rest a generic fallback.
function issueMessage(error: ValidationError): string {
  if (error.message) return error.message;
  return error.kind === 'required' ? 'This field is required.' : 'Invalid value.';
}

// Resolves an error back to the authored field it sits on, for its label. The
// summary hands us the errored `FieldTree`; the flat `fields` list holds every
// leaf's path, so identity against `fieldAt` finds the config — and its label.
function issueLabel(
  error: ValidationError.WithFieldTree,
  fields: FormState<Record<string, unknown>>['fields'],
  root: Record<string, FieldTree<unknown>>,
): string {
  for (const field of fields) {
    if (fieldAt(root, field.path) === error.fieldTree) {
      return readReactive(field.node.label) ?? field.key;
    }
  }
  return String((error.fieldTree() as FieldState<unknown>).keyInParent());
}

// The implicit single-value field tree behind a standalone control. The pool is
// erased here, so the schema/model pairing is asserted once — the typed
// `createControl` signature already guaranteed it against the component's value.
function controlField(def: AnyControlEntry): FieldTree<unknown> {
  const model = signal<unknown>(def.initial());
  const schema = def.schema;
  if (!schema) return form(model);
  return form(model, (p) => validateStandardSchema(p as never, schema as never));
}

/** Instantiates a step's forms and standalone controls, registers them for the
 *  completion fold, and wires their shared links. */
export function materializeStep(
  step: StepNode,
  pool: Record<string, FormConfig<Record<string, unknown>>>,
  controlPool: Record<string, AnyControlEntry>,
  shared: SharedState<Record<string, unknown>>,
  injector: Injector,
): LiveStep {
  const registry = new InstanceRegistry();
  const forms: LiveForm[] = [];
  const controls: LiveControl[] = [];

  for (const node of formNodes(step)) {
    const config = pool[node.name];
    if (!config) continue;

    const state = runInInjectionContext(injector, () => instantiateForm(config));
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

    // Each recorded effect, with its handler bound to this form's live model.
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

    // Seed once on materialization — that is this form's entry.
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

  for (const node of controlNodes(step)) {
    const def = controlPool[node.name];
    if (!def) continue;

    const field = runInInjectionContext(injector, () => controlField(def));
    const visible: Signal<boolean> = node.visibleWhen
      ? computed(node.visibleWhen)
      : computed(() => true);

    registry.add({ rootForm: field, visible });

    const sync = fieldSync(field);
    const slot = node.sharedKey ? shared.slot(node.sharedKey) : undefined;
    const label = def.label ?? node.name;
    const issues = computed<readonly StepIssue[]>(() =>
      (field() as FieldState<unknown>)
        .errorSummary()
        .map((error) => ({ label, message: issueMessage(error) })),
    );

    const seed = () => {
      if (slot) seedFromShared(sync, slot);
    };
    seed();
    controls.push({
      name: node.name,
      component: def.component as Type<unknown>,
      bindings: node.bindings,
      layout: node.layout,
      field,
      label,
      visible,
      issues,
      value: () => sync.read(),
      seed,
      commit: () => {
        if (slot) commitToShared(sync, slot);
      },
      touch: () => (field() as FieldState<unknown>).markAsTouched(),
    });
  }

  return { registry, forms, controls, pages: step.pages };
}

/**
 * Resolves a step's forms ahead of materialization, awaiting any lazy loaders so
 * the sync `materializeStep` above can consume a plain config map. Eager configs
 * pass straight through; only steps with lazily-declared forms incur a `Promise`.
 * (Standalone controls are always eager — their component is already bundled.)
 */
export async function resolveStepForms(
  step: StepNode,
  pool: Record<string, AnyFormProvider>,
  ctx: RuntimeStepContext,
): Promise<Record<string, FormConfig<Record<string, unknown>>>> {
  // Loaded together: the forms on one step do not depend on each other, and
  // awaiting them in a row makes the step cost the *sum* of its imports on the one
  // path the placeholder exists to keep short.
  const entries = await Promise.all(
    formNodes(step).map(async (node) => {
      const entry = pool[node.name];
      if (!entry) return null;
      // A loader is a function, a contextual factory carries `build`, a config is
      // the object itself - that is the discriminator.
      const config =
        typeof entry === 'function'
          ? await entry()
          : isContextualForm(entry)
            ? entry.build(ctx)
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

/** Every pool name a step commits under — its forms and its standalone controls.
 *  What a recurrent flow clears from its committed map when a new pass opens. */
export function stepValueNames(step: StepNode): readonly string[] {
  return [...formNodes(step).map((node) => node.name), ...controlNodes(step).map((node) => node.name)];
}
