import {
  createEnvironmentInjector,
  EnvironmentInjector,
  Injector,
  Provider,
  runInInjectionContext,
  signal,
  SkipSelf,
  WritableSignal,
} from '@angular/core';
import { CONTROL_ADAPTER, ControlAdapter } from '../../controls';
import { FormState, instantiateRuntimeForm, RuntimeFormConfig } from '../../form';
import { createSharedState, SharedState } from '../../shared';
import { isFlowStep, isStepNode } from '../builder/flow';
import { FlowStepNode, RuntimeFlow } from '../types/flow';
import { FlowHome, FlowInstance, RuntimeStepForms } from '../types/flow-instance';
import { FormNode, StepNode } from '../types/nodes';
import { RuntimeStepperContext } from '../types/step-context';
import { formNodes, templateOf } from './materialize-step';

/**
 * A built flow's instances. Every eager form - a config placed on a step built once, gated or not - is built here, with
 * the flow; a lazy one gets a signal that holds its instance once its step brings it to life; a step built on entry
 * gets one such signal per form name. A nested flow is a child built the same way, in an environment of its own.
 */
export class FormadFlowInstance<TResult = unknown> implements FlowInstance<TResult> {
  readonly sharedState: SharedState;

  readonly environment: EnvironmentInjector;

  readonly steps: Readonly<Record<string, { readonly forms: RuntimeStepForms }>>;

  /** The formFields' element injector: where `build()` was called, with this flow's control kinds layered over. */
  private readonly injector: Injector;

  private readonly context: WritableSignal<() => RuntimeStepperContext>;

  private readonly eager = new Map<FormNode, FormState>();

  private readonly lazy = new Map<FormNode, WritableSignal<FormState | null>>();

  private readonly onEntry = new Map<StepNode, Map<string, WritableSignal<FormState | null>>>();

  /** The placement each instance was built for: a step built on entry places new nodes, and they get new instances. */
  private readonly placedBy = new WeakMap<FormState, FormNode>();

  private readonly made = new Set<FormState>();

  private readonly children: ReadonlyMap<FlowStepNode, FormadFlowInstance>;

  constructor(
    readonly flow: RuntimeFlow<TResult>,
    home: FlowHome,
    providers: readonly Provider[] = [],
  ) {
    this.environment = createEnvironmentInjector([...providers, ...flow.providers], home.environment, 'formad-flow');
    this.injector = Injector.create({
      providers: [
        {
          provide: CONTROL_ADAPTER,
          useFactory: (parent: ControlAdapter): ControlAdapter => ({
            controlFor: (kind) => flow.controlTypes[kind] ?? parent.controlFor(kind),
          }),
          deps: [[new SkipSelf(), CONTROL_ADAPTER]],
        },
      ],
      parent: home.injector,
    });
    this.sharedState = createSharedState(flow.sharedSeeds);
    const shared = this.sharedState;
    this.context = signal(() => ({ steps: {}, shared, flow: undefined, parent: undefined }));
    this.children = new Map(
      flow.stepSequenceNodes.filter(isFlowStep).map((node) => [
        node,
        new FormadFlowInstance(node.flow, { injector: this.injector, environment: this.environment }),
      ]),
    );

    const steps: Record<string, { readonly forms: RuntimeStepForms }> = {};
    for (const step of flow.stepSequenceNodes.filter(isStepNode)) {
      const forms = this.built(step);
      if (step.name !== undefined) steps[step.name] = { forms };
    }
    this.steps = steps;
  }

  formFor(step: StepNode, node: FormNode, config: RuntimeFormConfig): FormState {
    const eager = this.eager.get(node);
    if (eager) return eager;

    const lazy = this.lazy.get(node);
    if (lazy) {
      const made = lazy() ?? this.instantiate(node, config);
      lazy.set(made);

      return made;
    }

    const slot = this.entrySlot(step, node.name);
    const current = slot();
    if (current && this.placedBy.get(current) === node) return current;

    if (current) {
      current.destroy();
      this.made.delete(current);
    }
    const made = this.instantiate(node, config);
    slot.set(made);

    return made;
  }

  child(node: FlowStepNode): FlowInstance {
    const child = this.children.get(node);
    if (!child) throw new Error(`ngx-formad: the nested flow "${node.name}" is not part of this flow.`);

    return child;
  }

  attach(context: () => RuntimeStepperContext): void {
    this.context.set(context);
  }

  reset(): void {
    for (const child of this.children.values()) child.reset();
    for (const state of this.made) state.reset();
  }

  destroy(): void {
    for (const child of this.children.values()) child.destroy();
    for (const state of this.made) state.destroy();
    this.made.clear();
    this.environment.destroy();
  }

  /** A step's forms as the stepper hands them out; a step built once has its eager forms built here and now. */
  private built(step: StepNode): RuntimeStepForms {
    const pages = step.pages;
    if ('build' in pages) {
      return new Proxy({} as Record<string, unknown>, {
        get: (_own, key) => (typeof key === 'string' ? this.entrySlot(step, key).asReadonly() : undefined),
      }) as RuntimeStepForms;
    }

    const forms: Record<string, RuntimeStepForms[string]> = {};
    for (const node of formNodes(pages)) {
      const template = templateOf(node, this.flow.forms);
      if (!template) continue;

      if (typeof template === 'function') {
        const slot = signal<FormState | null>(null);
        this.lazy.set(node, slot);
        forms[node.name] = slot.asReadonly();
      } else {
        const state = this.instantiate(node, template);
        this.eager.set(node, state);
        forms[node.name] = state;
      }
    }

    return forms;
  }

  private entrySlot(step: StepNode, name: string): WritableSignal<FormState | null> {
    const slots = this.onEntry.get(step) ?? new Map<string, WritableSignal<FormState | null>>();
    this.onEntry.set(step, slots);
    const slot = slots.get(name) ?? signal<FormState | null>(null);
    slots.set(name, slot);

    return slot;
  }

  private instantiate(node: FormNode, config: RuntimeFormConfig): FormState {
    const state = runInInjectionContext(this.environment, () =>
      instantiateRuntimeForm(config, {
        injector: this.injector,
        environment: this.environment,
        bindings: node.bindings,
        effects: node.effects,
        context: () => this.context()(),
      }),
    );
    this.placedBy.set(state, node);
    this.made.add(state);

    return state;
  }
}
