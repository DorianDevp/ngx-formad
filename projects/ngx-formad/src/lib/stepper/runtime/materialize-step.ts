import { computed, Injector, isSignal, runInInjectionContext, Signal } from '@angular/core';
import { ValidationError } from '@angular/forms/signals';
import { CUSTOM_FIELD } from 'formodel';
import {
  FieldLeaf,
  FieldLevel,
  FormState,
  instantiateRuntimeForm,
  isLevel,
  mountInjector,
  RuntimeFormConfig,
} from '../../form';
import { LiveForm, LiveStep, MaterializeOptions, StepIssue } from '../types/live-step';
import { ComponentNode, FormNode, FormRevisit, LayoutNode, LayoutNodeKind, PageNode } from '../types/nodes';
import { AnyFormProvider, RuntimeStepContext, RuntimeStepperContext } from '../types/step-context';
import { InstanceRegistry } from './instance-registry';

/** A gate as a node holds it, erased. */
type Gate = (ctx: RuntimeStepperContext) => boolean;

/** One placed form with the gates it sits under: its page's, then each enclosing row's, then its own. */
interface PlacedForm {
  readonly node: FormNode;

  readonly gates: readonly Gate[];
}

/**
 * The forms the pages place, each with the gates that decide whether it is there at all. A form inside a hidden row or
 * on a hidden page is not just undrawn: it must not hold Next either, so the enclosing gates travel with it.
 */
function placedForms(pages: readonly PageNode[]): PlacedForm[] {
  const walk = (nodes: readonly LayoutNode[], gates: readonly Gate[]): PlacedForm[] =>
    nodes.flatMap((node) => {
      if (node.kind === LayoutNodeKind.Form) {
        return [{ node, gates: node.visibleWhen ? [...gates, node.visibleWhen] : gates }];
      }
      if (node.kind !== LayoutNodeKind.Row) return [];

      return walk(node.children, node.visibleWhen ? [...gates, node.visibleWhen] : gates);
    });

  return pages.flatMap((page) => {
    const own = page.options.visibleWhen;

    return walk(page.children, own ? [own] : []);
  });
}

function walkPages<N extends LayoutNode>(pages: readonly PageNode[], kind: N['kind']): N[] {
  const walk = (nodes: readonly LayoutNode[]): N[] =>
    nodes.flatMap((node) => {
      if (node.kind === kind) return [node as N];

      return node.kind === LayoutNodeKind.Row ? walk(node.children) : [];
    });

  return pages.flatMap((page) => walk(page.children));
}

/** The form nodes the pages place, in order, rows included. */
export function formNodes(pages: readonly PageNode[]): FormNode[] {
  return walkPages<FormNode>(pages, LayoutNodeKind.Form);
}

function fieldAt(root: FieldLevel, path: readonly string[]): FieldLeaf {
  let node: FieldLeaf = root;
  for (const segment of path) {
    if (!isLevel(node)) throw new Error(`ngx-formad: "${segment}" sits under a field that is not an object.`);

    const child = node[segment];
    if (child === undefined) throw new Error(`ngx-formad: the form model field "${segment}" is empty in tree.`);

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

  return label === undefined ? field.key : isSignal(label) ? label() : label;
}

/** A seed's entries that carry a value; an `undefined` one means "leave the field as it is", not "unset it". */
function definedEntries(seed: Record<string, unknown>): [string, unknown][] {
  return Object.entries(seed).filter(([, value]) => value !== undefined);
}

function liveForm(
  placed: PlacedForm,
  options: MaterializeOptions,
  ctx: RuntimeStepContext,
  seeded: Readonly<Record<string, FormState>>,
): LiveForm | null {
  const node = placed.node;
  const template = options.pool[node.name];
  if (!template) return null;

  const state = runInInjectionContext(options.environment, () =>
    instantiateRuntimeForm(template, {
      injector: options.injector,
      shared: options.shared,
      bindings: node.bindings,
      effects: node.effects,
      context: options.context ?? (() => options.entry),
    }),
  );
  const root = state.rootForm;
  const visible: Signal<boolean> = computed(() => placed.gates.every((gate) => gate(ctx)));
  const issues = computed<readonly StepIssue[]>(() =>
    root()
      .errorSummary()
      .map((error) => ({ label: issueLabel(error, state), message: issueMessage(error) })),
  );

  /** Writes each value into its field unless the user edited it; a programmatic write leaves the field pristine. */
  const sow = (values: readonly [readonly string[], unknown][]): void => {
    for (const [path, value] of values) {
      const field = fieldAt(root, path)();
      if (!field.dirty()) field.value.set(value);
    }
  };
  // A seeding form sees itself and the siblings already seeded; one still waiting is absent, so reading it fails
  // loudly instead of handing over a default that the seed after this one is about to replace.
  const local = (entry: RuntimeStepperContext): [readonly string[], unknown][] => {
    const at: RuntimeStepContext = { ...entry, forms: { ...seeded, [node.name]: state } };

    return definedEntries(node.initial?.(at) ?? {}).map(([key, value]) => [[key], value]);
  };
  const linked = (): [readonly string[], unknown][] =>
    node.links.map((link) => [link.modelPath, options.shared.get(link.sharedKey)]);

  return {
    name: node.name,
    state,
    visible,
    issues,
    seed: (ctx) => sow([...local(ctx), ...linked()]),
    reseed: (ctx) => sow([...(node.revisit === FormRevisit.Reseed ? local(ctx) : []), ...linked()]),
    commit: () => {
      for (const link of node.links) {
        const field = fieldAt(root, link.modelPath)();
        options.shared.patch({ [link.sharedKey]: field.value() });
      }
    },
    touch: () => {
      for (const field of state.fields) fieldAt(root, field.path)().markAsTouched();
    },
    destroy: () => state.destroy(),
  };
}

/**
 * The context a page component's bindings are built over: getters, not a snapshot, so a binding created once at mount
 * reads the steps alive when it is evaluated - as long as the binding reads the context inside its own getter.
 */
function liveContext(options: MaterializeOptions, forms: Readonly<Record<string, FormState>>): RuntimeStepContext {
  const now = options.context ?? (() => options.entry);

  return {
    get forms() {
      return forms;
    },
    get steps() {
      return now().steps;
    },
    get shared() {
      return now().shared;
    },
    get flow() {
      return now().flow;
    },
    get parent() {
      return now().parent;
    },
  };
}

/** A page component's mount, for the mount point its row draws: the component with its bindings, in the flow's environment. */
function componentInjector(node: ComponentNode, options: MaterializeOptions, ctx: RuntimeStepContext): Injector {
  return mountInjector(
    { component: node.component, directives: [], bindings: node.bindings(ctx), environment: options.environment },
    options.injector ?? options.environment,
  );
}

/** Instantiates a step's placed forms and components, registers the forms for completion and wires their shared links. */
export function materializeStep(pages: readonly PageNode[], options: MaterializeOptions): LiveStep {
  const registry = new InstanceRegistry();
  const instances: Record<string, FormState> = {};
  const seeded: Record<string, FormState> = {};
  const ctx = liveContext(options, instances);
  const forms = placedForms(pages).flatMap((placed) => {
    const live = liveForm(placed, options, ctx, seeded);

    return live === null ? [] : [live];
  });
  // What the page draws, and what a gate or a binding reads, is every instance the step placed - order-free.
  for (const form of forms) instances[form.name] = form.state;
  for (const form of forms) {
    registry.add({ rootForm: form.state.rootForm, visible: form.visible });
    form.seed(options.entry);
    seeded[form.name] = form.state;
  }

  return {
    registry,
    forms,
    components: new Map(
      walkPages<ComponentNode>(pages, LayoutNodeKind.Component).map((node) => [
        node,
        componentInjector(node, options, ctx),
      ]),
    ),
    instances,
    pages,
    context: ctx,
  };
}

/** The template a placed form resolves to: the one given at the page, else the pool entry it names. */
export function templateOf(node: FormNode, pool: Record<string, AnyFormProvider>): AnyFormProvider | undefined {
  return node.template ?? pool[node.name];
}

/** Resolves the templates the pages place: loaders are awaited, configs pass through. */
export async function resolveStepForms(
  pages: readonly PageNode[],
  pool: Record<string, AnyFormProvider>,
): Promise<Record<string, RuntimeFormConfig>> {
  const entries = await Promise.all(
    formNodes(pages).map(async (node) => {
      const entry = templateOf(node, pool);
      if (!entry) return null;

      const config = typeof entry === 'function' ? await entry() : entry;

      return [node.name, config] as const;
    }),
  );

  return Object.fromEntries(entries.flatMap((entry) => (entry === null ? [] : [entry])));
}
