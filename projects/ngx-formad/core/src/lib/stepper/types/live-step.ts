import { EnvironmentInjector, Injector, Signal } from '@angular/core';
import { FormState, RuntimeFormConfig } from '../../form';
import { SharedState } from '../../shared';
import type { InstanceRegistry } from '../runtime/instance-registry';
import { ComponentNode, FormNode, PageNode } from './nodes';
import { RuntimeStepContext, RuntimeStepperContext } from './step-context';

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

  /**
   * First entry: `initial` over the entry context, then the shared links, into the fresh fields. The caller hands the
   * navigation being built - the live context would still name the steps of the previous one - and the step's own
   * forms are layered in here.
   */
  seed(entry: RuntimeStepperContext): void;

  /** A later entry: the shared links into the fields the user has not edited, and `initial` again when the form reseeds. */
  reseed(entry: RuntimeStepperContext): void;

  commit(): void;

  touch(): void;
}

/** A step turned live: its registry, forms, an injector per page component carrying its mount, instances by pool name and pages. */
export interface LiveStep {
  readonly registry: InstanceRegistry;

  readonly forms: readonly LiveForm[];

  readonly components: ReadonlyMap<ComponentNode, Injector>;

  readonly instances: Readonly<Record<string, FormState>>;

  readonly pages: readonly PageNode[];

  /** The step's live context, as the page's own `visibleWhen` gates and bindings read it. */
  readonly context: RuntimeStepContext;
}

/**
 * What a step materializes against: the resolved templates, the instance each placed form draws, the shared store,
 * the flow environment, the element injector its components resolve through (the stepper's; the environment when there
 * is none) and the entry context.
 */
export interface MaterializeOptions {
  readonly pool: Record<string, RuntimeFormConfig>;

  /** The instance a placed form draws: built with the stepper, or now from its resolved template. */
  formFor(node: FormNode, config: RuntimeFormConfig): FormState;

  readonly shared: SharedState;

  readonly environment: EnvironmentInjector;

  readonly injector?: Injector;

  readonly entry: RuntimeStepperContext;

  /** The context a page component's bindings read; called again on every read, so `steps` stays live. */
  readonly context?: () => RuntimeStepperContext;
}
