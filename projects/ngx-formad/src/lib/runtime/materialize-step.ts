import {
  ApplicationRef,
  ComponentRef,
  computed,
  createComponent,
  EnvironmentInjector,
  Injector,
  runInInjectionContext,
  Signal,
} from '@angular/core';
import { ValidationError } from '@angular/forms/signals';
import { CUSTOM_FIELD } from 'formodel';
import { ComponentNode, FormNode, LayoutNode, LayoutNodeKind, PageNode } from '../builders/nodes';
import { AnyFormProvider, RuntimeStepContext } from '../builders/step-context';
import { RuntimeFormConfig } from '../form-config/form-config';
import { read } from '../form-config/live';
import { FieldLeaf, FieldLevel, FormState, instantiateRuntimeForm, isLevel } from '../renderer/instantiate-form';
import { InstanceRegistry } from '../registry/instance-registry';
import { SharedState } from '../sync/shared-state';

/** One blocker shown when Next is refused: the field's label and the message. */
export interface StepIssue {
  readonly label: string;

  readonly message: string;
}

/** One placed form turned live: its state, visibility, issues and the seed/commit/touch actions. */
export interface LiveForm {
  readonly name: string;

  readonly state: FormState;

  readonly visible: Signal<boolean>;

  readonly issues: Signal<readonly StepIssue[]>;

  seed(): void;

  commit(): void;

  touch(): void;
}

/** A step turned live: its registry, forms, the page components' host elements by node, instances by pool name and pages. */
export interface LiveStep {
  readonly registry: InstanceRegistry;

  readonly forms: readonly LiveForm[];

  readonly components: ReadonlyMap<ComponentNode, Node[][]>;

  readonly instances: Readonly<Record<string, FormState>>;

  readonly pages: readonly PageNode[];

  destroy(): void;
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

  return label === undefined ? field.key : read(label);
}

/**
 * What a step materializes against: the resolved templates, the shared store, the flow environment, the element
 * injector its components resolve through (the stepper's; the environment when there is none) and the entry context.
 */
export interface MaterializeOptions {
  readonly pool: Record<string, RuntimeFormConfig>;

  readonly shared: SharedState;

  readonly environment: EnvironmentInjector;

  readonly injector?: Injector;

  readonly entry: RuntimeStepContext;
}

function liveForm(node: FormNode, options: MaterializeOptions): LiveForm | null {
  const template = options.pool[node.name];
  if (!template) return null;

  const seed = node.initial?.(options.entry);
  const config = seed ? { ...template, model: () => ({ ...template.model(), ...seed }) } : template;
  const state = runInInjectionContext(options.environment, () =>
    instantiateRuntimeForm(config, { injector: options.injector, effects: node.effects, shared: options.shared }),
  );
  const root = state.rootForm;
  const visible: Signal<boolean> = node.visibleWhen ? computed(node.visibleWhen) : computed(() => true);
  const issues = computed<readonly StepIssue[]>(() =>
    root()
      .errorSummary()
      .map((error) => ({ label: issueLabel(error, state), message: issueMessage(error) })),
  );

  return {
    name: node.name,
    state,
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

/** Creates a page's component as the step materializes; the view renders on the next tick and a slot projects its host. */
function mountComponent(node: ComponentNode, options: MaterializeOptions): ComponentRef<unknown> {
  const ref = createComponent(node.component, {
    environmentInjector: options.environment,
    elementInjector: options.injector ?? options.environment,
    bindings: [...node.bindings],
  });
  options.environment.get(ApplicationRef).attachView(ref.hostView);
  ref.changeDetectorRef.markForCheck();

  return ref;
}

/** Instantiates a step's placed forms and components, registers the forms for completion and wires their shared links. */
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
  const mounted = walkPages<ComponentNode>(pages, LayoutNodeKind.Component).map(
    (node) => [node, mountComponent(node, options)] as const,
  );

  return {
    registry,
    forms,
    components: new Map(mounted.map(([node, ref]) => [node, [[ref.location.nativeElement as Node]]])),
    instances: Object.fromEntries(forms.map((form) => [form.name, form.state])),
    pages,
    destroy: () => {
      for (const form of forms) form.state.destroy();
      for (const [, ref] of mounted) ref.destroy();
    },
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
