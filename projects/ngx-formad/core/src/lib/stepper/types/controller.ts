import { EnvironmentInjector, Injector, Signal } from '@angular/core';
import { LiveStep, StepIssue } from './live-step';
import { SharedSignals } from '../../shared';
import { DeferTrigger, RecurrentSignals, RuntimeStepperContext } from './step-context';

/** Options of `goTo`; `fresh` drops the target and everything after it before entering. */
export interface GoToOptions {
  readonly fresh?: boolean;
}

/** A rail step's state relative to the active one. */
export enum ProgressStepState {
  Done = 'done',
  Active = 'active',
  Todo = 'todo',
}

/** The two shapes a progress level can take. */
export enum ProgressLevelKind {
  Linear = 'linear',
  Recurrent = 'recurrent',
}

/** One rail entry. */
export interface ProgressStep {
  readonly label: string;

  readonly state: ProgressStepState;
}

/** A linear flow's rail: its effective steps and the active position. */
export interface LinearProgressLevel {
  readonly kind: ProgressLevelKind.Linear;

  readonly index: number;

  readonly total: number;

  readonly steps: readonly ProgressStep[];
}

/** The dock as the rail draws it; `reachable` means it can be landed on without walking the pass. */
export interface ProgressDock {
  readonly label: string;

  readonly active: boolean;

  readonly reachable: boolean;
}

/** A ring's rail: the open pass bar (null on the dock), the dock, and how many passes folded. */
export interface RecurrentProgressLevel {
  readonly kind: ProgressLevelKind.Recurrent;

  readonly folds: number;

  readonly pass: LinearProgressLevel | null;

  readonly dock: ProgressDock;
}

/** One progress level per controller along the active chain. */
export type ProgressLevel = LinearProgressLevel | RecurrentProgressLevel;

/** The nesting-aware progress model, outermost level first. */
export interface StepperProgress {
  readonly levels: readonly ProgressLevel[];
}

/** How a nested controller reaches its parent: context, shared and ring signals, and the two outward edges. */
export interface FlowOutlet {
  context(): RuntimeStepperContext;

  shared(): SharedSignals;

  flow(): RecurrentSignals | undefined;

  advanceOut(): void;

  backOut(): void;

  canBackOut(): boolean;

  committedBelow(): void;
}

/**
 * What a controller is hosted by: its parent environment, the element injector its steps' components resolve
 * through (the stepper's; the flow environment when absent), completion and commit callbacks, or a parent outlet.
 */
export interface ControllerHost<TResult = unknown> {
  readonly environment: EnvironmentInjector;

  readonly injector?: Injector;

  readonly onComplete?: (result: TResult | null) => void;

  readonly onStep?: (values: RuntimeStepperContext['steps']) => void;

  readonly outlet?: FlowOutlet;
}

/** The headless stepper engine a chrome renders: leaf state, navigation, progress and egress. */
export interface StepperController<TResult = unknown> {
  readonly step: Signal<LiveStep | null>;

  readonly loading: Signal<boolean>;

  readonly index: Signal<number>;

  readonly total: Signal<number>;

  readonly label: Signal<string>;

  readonly labels: Signal<readonly string[]>;

  readonly progress: Signal<StepperProgress>;

  readonly heading: Signal<string>;

  readonly subheading: Signal<string>;

  readonly canBack: Signal<boolean>;

  /** Back would leave the open pass of a ring for its dock, the state untouched: a chrome labels it as cancelling. */
  readonly backCancels: Signal<boolean>;

  readonly canNext: Signal<boolean>;

  readonly nextBlocked: Signal<boolean>;

  readonly validating: Signal<boolean>;

  readonly blockers: Signal<readonly StepIssue[]>;

  readonly isLast: Signal<boolean>;

  readonly optional: Signal<boolean>;

  readonly deferTrigger: Signal<DeferTrigger | null>;

  readonly result: Signal<TResult | null>;

  readonly committed: Signal<RuntimeStepperContext['steps']>;

  next(): void;

  back(): void;

  skip(): void;

  goTo(target: number | string, options?: GoToOptions): void;

  destroy(): void;

  reset(): void;

  dockRestart(): void;

  dockAmend(update: (state: unknown) => unknown): void;
}
