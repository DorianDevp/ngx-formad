import { EnvironmentInjector, Injector, Signal } from '@angular/core';
import { FormState, RuntimeFormConfig } from '../../form';
import { SharedState } from '../../shared';
import type { FlowStepNode, RuntimeFlow } from './flow';
import { FormNode, StepNode } from './nodes';
import { RuntimeStepperContext } from './step-context';

/** Where a flow is built: the injector its formFields hang under and the environment its own one is made in. */
export interface FlowHome {
  readonly injector: Injector;
  readonly environment: EnvironmentInjector;
}

/** A step's forms as the built stepper hands them out, erased: an instance, or a signal holding one once it exists. */
export type RuntimeStepForms = Readonly<Record<string, FormState | Signal<FormState | null>>>;

/**
 * A built flow's instances: the flow they were built from, its shared state made of the flow's seeds, its environment,
 * every eager form built with it, the lazy ones as they come, the nested flows' own. What the controller drives and
 * what the built stepper hands out are these very instances.
 */
export interface FlowInstance<TResult = unknown> {
  readonly flow: RuntimeFlow<TResult>;
  readonly sharedState: SharedState;
  readonly environment: EnvironmentInjector;
  readonly steps: Readonly<Record<string, { readonly forms: RuntimeStepForms }>>;

  /** The instance a step brought to life draws for a placed form: the one built with the flow, or one built now from `config`. */
  formFor(step: StepNode, node: FormNode, config: RuntimeFormConfig): FormState;

  child(node: FlowStepNode): FlowInstance;

  /** The context the instances' handlers and effects read: the one the controller driving the flow builds. */
  attach(context: () => RuntimeStepperContext): void;

  /** Starts every instance of this flow over, the nested flows' included. */
  reset(): void;

  destroy(): void;
}
