import {
  computed,
  createEnvironmentInjector,
  EnvironmentInjector,
  Injector,
  runInInjectionContext,
  signal,
  Signal,
} from '@angular/core';
import { PageNode, SequenceNodeKind, StepNode, StepRevisit } from '../builders/nodes';
import {
  FlowStepNode,
  isFlowStep,
  isRecurrent,
  RecurrentFlowDefinition,
  RuntimeFlow,
  SequenceNode,
} from '../builders/flow';
import { DeferTrigger, RecurrentSignals, RuntimeStepContext, SharedSignals } from '../builders/step-context';
import { RuntimeFormConfig } from '../form-config/form-config';
import { Live, read } from '../form-config/live';
import { FormState } from '../renderer/instantiate-form';
import { effectiveSteps } from './effective-sequence';
import { FlowRing } from './flow-ring';
import {
  LiveStep,
  StepIssue,
  formNodes,
  materializeStep,
  resolveStepForms,
} from './materialize-step';
import { Navigation, StepMemo } from './navigation';

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
  context(): RuntimeStepContext;

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

  readonly onStep?: (values: RuntimeStepContext['steps']) => void;

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

  readonly canNext: Signal<boolean>;

  readonly nextBlocked: Signal<boolean>;

  readonly validating: Signal<boolean>;

  readonly blockers: Signal<readonly StepIssue[]>;

  readonly isLast: Signal<boolean>;

  readonly optional: Signal<boolean>;

  readonly deferTrigger: Signal<DeferTrigger | null>;

  readonly result: Signal<TResult | null>;

  readonly committed: Signal<RuntimeStepContext['steps']>;

  next(): void;

  back(): void;

  skip(): void;

  goTo(target: number | string, options?: GoToOptions): void;

  destroy(): void;

  reset(): void;

  dockRestart(): void;
}

function resolveText(value: Live<string> | undefined): string {
  return value === undefined ? '' : read(value);
}

type ResolvedForms = Record<string, RuntimeFormConfig>;

export class FormadStepperController<TResult = unknown> implements StepperController<TResult> {
  /** The one piece of state this controller writes; every action replaces it with what the aggregate hands back. */
  private readonly nav = signal(Navigation.start);

  private readonly ring: FlowRing<TResult> | null;

  private readonly recurrentFlow: RecurrentFlowDefinition<TResult> | null;

  private readonly children: ReadonlyMap<FlowStepNode, FormadStepperController>;

  readonly environment: EnvironmentInjector;

  private readonly injector: Injector;

  private readonly contextShared: SharedSignals;

  private readonly contextFlow: RecurrentSignals | undefined;

  private readonly outlet: FlowOutlet | undefined;

  private readonly onComplete: ((result: TResult | null) => void) | undefined;

  private readonly onStep: ((values: RuntimeStepContext['steps']) => void) | undefined;

  constructor(
    private readonly flow: RuntimeFlow<TResult>,
    host: ControllerHost<TResult>,
  ) {
    this.outlet = host.outlet;
    this.onComplete = host.onComplete;
    this.onStep = host.onStep;
    this.environment = createEnvironmentInjector([...flow.providers], host.environment, 'formad-flow');
    this.injector = host.injector ?? this.environment;
    this.recurrentFlow = isRecurrent(flow) ? flow : null;
    this.ring = this.recurrentFlow ? new FlowRing(this.recurrentFlow) : null;
    this.contextShared = { ...(host.outlet?.shared() ?? {}), ...flow.shared.signals() };
    this.contextFlow = this.ring
      ? { state: this.ring.state, passOpen: this.ring.passOpen }
      : host.outlet?.flow();
    this.children = this.spawnChildren();
    if (!host.outlet) this.nav.set(this.landed(Navigation.start));
  }

  private inContext<T>(compute: () => T): T {
    return runInInjectionContext(this.environment, compute);
  }

  /** The context over a set of live steps: the computeds build it for the state as it is, actions for the state they are building. */
  private contextOf(memo: StepMemo): RuntimeStepContext {
    return {
      steps: Object.fromEntries(
        this.flow.steps.map((node, index) => [
          stepKey(node, index),
          isFlowStep(node) ? this.children.get(node)?.egress() : memo.get(node)?.instances,
        ]),
      ),
      shared: this.contextShared,
      flow: this.contextFlow,
      parent: this.outlet?.context(),
    };
  }

  private context(): RuntimeStepContext {
    return this.contextOf(this.nav().memo);
  }

  private effectiveOf(nav: Navigation): readonly SequenceNode[] {
    return this.inContext(() => effectiveSteps(this.flow.steps, this.contextOf(nav.memo)));
  }

  private currentOf(nav: Navigation): SequenceNode | null {
    return nav.landing(this.effectiveOf(nav), this.flow.steps);
  }

  private readonly effective = computed(() => this.effectiveOf(this.nav()));

  private readonly current = computed(() => this.nav().landing(this.effective(), this.flow.steps));

  private readonly position = computed(() => {
    const node = this.current();
    return node ? this.effective().indexOf(node) : -1;
  });

  private readonly currentStep = computed<StepNode | null>(() => {
    const node = this.current();
    return node && node.kind === SequenceNodeKind.Step ? node : null;
  });

  private readonly child: Signal<FormadStepperController | null> = computed(() => {
    const node = this.current();
    return node && isFlowStep(node) ? (this.children.get(node) ?? null) : null;
  });

  /** The current step as brought to life; `null` while its forms are still being fetched. Bringing it to life is an action, see `landed`. */
  private readonly ownStep = computed<LiveStep | null>(() => {
    const node = this.currentStep();

    return node ? (this.nav().stepOf(node) ?? null) : null;
  });

  readonly step: Signal<LiveStep | null> = computed(() => {
    const child = this.child();
    return child ? child.step() : this.ownStep();
  });

  readonly loading: Signal<boolean> = computed(() => {
    const child = this.child();
    if (child) return child.loading();
    return this.current() !== null && this.ownStep() === null;
  });

  readonly committed: Signal<RuntimeStepContext['steps']> = computed(() => {
    const memo = this.nav().memo;

    return Object.fromEntries(
      this.flow.steps.flatMap((node, index) => {
        if (isFlowStep(node)) return [[stepKey(node, index), this.children.get(node)?.egress()]];

        const live = memo.get(node);

        return live ? [[stepKey(node, index), valuesOf(live)]] : [];
      }),
    );
  });

  readonly index = this.position;

  readonly total = computed(() => this.effective().length);

  readonly labels = computed<readonly string[]>(() =>
    this.effective().map((step) => resolveText(step.label)),
  );

  readonly label: Signal<string> = computed(() => {
    const child = this.child();
    return child ? child.label() : resolveText(this.current()?.label);
  });

  private readonly options = computed(() => this.ownStep()?.pages[0]?.options);

  readonly heading: Signal<string> = computed(() => {
    const child = this.child();
    return child ? child.heading() : resolveText(this.options()?.heading);
  });

  readonly subheading: Signal<string> = computed(() => {
    const child = this.child();
    return child ? child.subheading() : resolveText(this.options()?.subheading);
  });

  readonly optional: Signal<boolean> = computed(() => {
    const child = this.child();
    return child ? child.optional() : (this.currentStep()?.optional ?? false);
  });

  readonly deferTrigger: Signal<DeferTrigger | null> = computed(() => {
    const child = this.child();
    return child ? child.deferTrigger() : (this.current()?.defer ?? null);
  });

  private readonly ownCanNext = computed<boolean>(() => {
    const node = this.currentStep();
    if (!node) return false;

    const formsComplete = this.ownStep()?.registry.completed() ?? false;
    const guard = node.completeWhen;
    return formsComplete && (guard ? this.inContext(() => guard(this.context())) : true);
  });

  readonly canNext: Signal<boolean> = computed(() => {
    const child = this.child();
    return child ? child.canNext() : this.ownCanNext();
  });

  readonly nextBlocked: Signal<boolean> = computed(() => {
    const child = this.child();
    return child ? child.nextBlocked() : this.nav().attemptedNext && !this.ownCanNext();
  });

  readonly validating: Signal<boolean> = computed(() => {
    const child = this.child();
    return child ? child.validating() : (this.ownStep()?.registry.pending() ?? false);
  });

  readonly blockers: Signal<readonly StepIssue[]> = computed(() => {
    const child = this.child();
    if (child) return child.blockers();
    if (!this.nextBlocked()) return [];

    const step = this.ownStep();
    const node = this.currentStep();
    if (!step || !node) return [];

    const issues: StepIssue[] = [];
    for (const form of step.forms) if (form.visible()) issues.push(...form.issues());

    const guard = node.completeWhen;
    if (guard && !this.inContext(() => guard(this.context()))) {
      issues.push({
        label: this.heading() || 'Step',
        message: node.incompleteMessage ?? 'This step is not complete yet.',
      });
    }

    if (!issues.length && step.registry.pending()) {
      issues.push({
        label: this.heading() || 'Step',
        message: 'Still checking some of your answers.',
      });
    }

    return issues;
  });

  private readonly ownCanBack = computed<boolean>(() => {
    if (this.position() > 0) return true;
    if (this.dockIsBehind()) return true;
    return this.outlet?.canBackOut() ?? false;
  });

  readonly canBack: Signal<boolean> = computed(() => {
    const child = this.child();
    return child ? child.canBack() : this.ownCanBack();
  });

  private readonly ownIsLast = computed<boolean>(() => {
    const node = this.current();
    const atEnd = this.position() === this.effective().length - 1;
    return atEnd && !(node ? this.foldsAfter(node) : false);
  });

  readonly isLast: Signal<boolean> = computed(() => {
    if (!this.ownIsLast()) return false;

    const child = this.child();
    return child ? child.isLast() : true;
  });

  readonly result = computed<TResult | null>(() => {
    if (this.ring) return this.ring.state();

    const resolve = this.flow.resolveResult;
    return resolve ? (this.inContext(() => resolve(this.context())) ?? null) : null;
  });

  readonly progress: Signal<StepperProgress> = computed(() => {
    const own = this.ownLevel();
    const child = this.child();
    return { levels: child ? [own, ...child.progress().levels] : [own] };
  });

  next(): void {
    const child = this.child();
    if (child) {
      child.next();
      return;
    }

    this.nextSelf();
  }

  back(): void {
    const child = this.child();
    if (child) {
      child.back();
      return;
    }

    this.backSelf();
  }

  skip(): void {
    const child = this.child();
    if (child) {
      child.skip();
      return;
    }

    if (this.optional()) this.advanceSelf();
  }

  goTo(target: number | string, options?: GoToOptions): void {
    this.commitCurrent();
    const eff = this.effective();
    const node =
      typeof target === 'number'
        ? eff[target]
        : eff.find((candidate) => resolveText(candidate.label) === target);
    if (!node) return;

    if (options?.fresh) this.discard(this.flow.steps.slice(this.flow.steps.indexOf(node)));
    this.enter(node);
  }

  reset(): void {
    this.flow.shared.reset();
    for (const child of this.children.values()) child.reset();
    this.ring?.reset();
    this.nav.set(this.outlet ? Navigation.start : this.landed(Navigation.start));
  }

  dockRestart(): void {
    const child = this.child();
    if (child) {
      child.dockRestart();

      return;
    }

    const flow = this.recurrentFlow;
    if (flow && this.current() === this.flow.steps[flow.dockAt]) this.restartPass();
  }

  destroy(): void {
    for (const child of this.children.values()) child.destroy();
    this.environment.destroy();
  }

  private nextSelf(): void {
    if (this.ownCanNext()) {
      this.advanceSelf();
      return;
    }

    const step = this.ownStep();
    if (step) {
      for (const form of step.forms) form.touch();
    }
    this.nav.set(this.nav().attempted());
  }

  private advanceSelf(): void {
    const from = this.current();
    this.commitCurrent();
    if (from && this.foldsAfter(from)) {
      const settled = this.withPredecessors(this.nav(), null);
      this.nav.set(settled);
      this.inContext(() => this.ring?.fold(this.contextOf(settled.memo)));
    }

    const eff = this.effective();
    const i = from ? eff.indexOf(from) : -1;
    if (i >= 0 && i < eff.length - 1) {
      this.enter(eff[i + 1]);
      return;
    }

    if (i === -1 && from) {
      const next = this.neighbour(from, 1);
      if (next) {
        this.enter(next);
        return;
      }
    }

    this.complete();
  }

  private backSelf(): void {
    const from = this.current();
    if (from && this.insideOpenPass(from)) this.discard([from]);
    else this.commitCurrent();

    const eff = this.effective();
    const i = from ? eff.indexOf(from) : -1;
    if (i > 0) {
      this.enter(eff[i - 1]);
      return;
    }

    if (i === -1 && from) {
      const previous = this.neighbour(from, -1);
      if (previous) {
        this.enter(previous);
        return;
      }
    }

    if (this.dockIsBehind()) {
      this.ring?.abandonPass();
      this.enter(this.flow.steps[this.recurrentFlow!.dockAt]);
      return;
    }

    this.outlet?.backOut();
  }

  private complete(): void {
    if (this.outlet) {
      this.outlet.advanceOut();
      return;
    }

    this.onComplete?.(this.result());
  }

  private foldsAfter(node: SequenceNode): boolean {
    const flow = this.recurrentFlow;
    if (!flow || !this.ring?.passOpen()) return false;

    const steps = this.flow.steps;
    const at = steps.indexOf(node);
    if (at < 0 || at >= flow.dockAt) return false;

    return !this.effective().some((candidate) => {
      const position = steps.indexOf(candidate);
      return position > at && position < flow.dockAt;
    });
  }

  private insideOpenPass(node: SequenceNode): boolean {
    const flow = this.recurrentFlow;
    if (!flow || !this.ring?.passOpen()) return false;

    const at = this.flow.steps.indexOf(node);
    return at >= 0 && at < flow.dockAt;
  }

  /** Drops the given steps: a nested flow starts over, a live step is forgotten and rebuilt on its next entry. */
  private discard(nodes: readonly SequenceNode[]): void {
    for (const node of nodes) {
      if (isFlowStep(node)) this.children.get(node)?.reset();
    }
    this.nav.set(this.nav().forgetting(nodes));
  }

  private dockIsBehind(): boolean {
    const flow = this.recurrentFlow;
    const ring = this.ring;
    if (!flow || !ring || !ring.passOpen()) return false;

    const node = this.current();
    if (!node || this.flow.steps.indexOf(node) >= flow.dockAt) return false;
    return ring.dockReachable();
  }

  private restartPass(): void {
    const flow = this.recurrentFlow;
    const ring = this.ring;
    if (!flow || !ring) return;

    const steps = this.flow.steps;
    this.discard(steps.slice(0, flow.dockAt));
    this.flow.shared.reset();
    ring.openPass();

    const first = this.effective().find((node) => steps.indexOf(node) < flow.dockAt);
    if (first) this.enter(first);
  }

  /** Moves the cursor and brings the step it lands on to life; the one place navigation changes state. */
  private enter(node: SequenceNode): void {
    this.nav.set(this.landed(this.nav().movedTo(node)));
  }

  /**
   * The navigation with its current step alive: a nested flow lands its own; a step shown before is seeded again, or
   * dropped first when it revisits fresh; a new step is brought to life after every eager step before it; one with lazy
   * forms is brought to life once they arrive, if it is still current then.
   */
  private landed(nav: Navigation): Navigation {
    const current = this.currentOf(nav);
    if (!current) return nav;
    if (isFlowStep(current)) {
      this.children.get(current)?.land();

      return nav;
    }

    const cached = nav.stepOf(current);
    if (cached && current.revisit !== StepRevisit.Fresh) {
      if (nav.shown !== current) for (const form of cached.forms) form.reseed(this.contextOf(nav.memo));

      return nav.shownAs(current);
    }

    const ready = this.withPredecessors(cached ? nav.forgetting([current]) : nav, current);
    const pages = this.pagesOf(current, ready);
    if (!this.hasLazyForms(pages)) return ready.withStep(current, this.materialize(pages, this.eagerConfigs(pages), ready));

    void resolveStepForms(pages, this.flow.forms).then((configs) => {
      this.nav.update((now) =>
        this.currentOf(now) === current && !now.stepOf(current)
          ? now.withStep(current, this.materialize(pages, configs, now))
          : now,
      );
    });

    return ready;
  }

  /** What a parent asks of a nested flow it lands on: bring the step your own cursor rests on to life. */
  private land(): void {
    this.nav.set(this.landed(this.nav()));
  }

  /** `nav` with every eager, ungated step before `upTo` alive, so a context built over it sees them all. */
  private withPredecessors(nav: Navigation, upTo: SequenceNode | null): Navigation {
    const steps = this.flow.steps;
    const limit = upTo ? steps.indexOf(upTo) : steps.length;

    return steps.slice(0, limit).reduce((settled, node) => {
      if (isFlowStep(node) || node.when || settled.stepOf(node)) return settled;

      const pages = this.pagesOf(node, settled);
      if (this.hasLazyForms(pages)) return settled;

      return settled.withStep(node, this.materialize(pages, this.eagerConfigs(pages), settled));
    }, nav);
  }

  private neighbour(node: SequenceNode, direction: 1 | -1): SequenceNode | undefined {
    const steps = this.flow.steps;
    const origin = steps.indexOf(node);
    const eff = this.effective();
    if (direction === 1) return eff.find((candidate) => steps.indexOf(candidate) > origin);

    let previous: SequenceNode | undefined;
    for (const candidate of eff) {
      if (steps.indexOf(candidate) < origin) previous = candidate;
      else break;
    }

    return previous;
  }

  private commitCurrent(): void {
    const node = this.current();
    if (!node) return;

    if (isFlowStep(node)) {
      this.children.get(node)?.commitCurrent();
      return;
    }

    const live = this.nav().stepOf(node);
    if (!live) return;

    for (const form of live.forms) if (form.visible()) form.commit();

    this.notifyCommitted();
  }

  private egress(): TResult | RuntimeStepContext['steps'] {
    return this.ring ? this.ring.state() : this.committed();
  }

  private notifyCommitted(): void {
    if (this.outlet) {
      this.outlet.committedBelow();
      return;
    }

    this.onStep?.(this.committed());
  }

  private spawnChildren(): ReadonlyMap<FlowStepNode, FormadStepperController> {
    const children = new Map<FlowStepNode, FormadStepperController>();
    for (const node of this.flow.steps) {
      if (isFlowStep(node)) children.set(node, this.spawn(node));
    }

    return children;
  }

  private spawn(node: FlowStepNode): FormadStepperController {
    const outlet: FlowOutlet = {
      context: () => this.context(),
      shared: () => this.contextShared,
      flow: () => this.contextFlow,
      advanceOut: () => this.advanceSelf(),
      backOut: () => this.backSelf(),
      canBackOut: () => this.ownCanBack(),
      committedBelow: () => this.notifyCommitted(),
    };

    return new FormadStepperController(node.flow, { environment: this.environment, injector: this.injector, outlet });
  }

  /** A step's pages: as authored, or built now over the context the given navigation provides. */
  private pagesOf(node: StepNode, nav: Navigation): readonly PageNode[] {
    const pages = node.pages;
    if (!('build' in pages)) return pages;

    return this.inContext(() => pages.build(this.contextOf(nav.memo)));
  }

  private hasLazyForms(pages: readonly PageNode[]): boolean {
    const pool = this.flow.forms;
    return formNodes(pages).some((node) => typeof pool[node.name] === 'function');
  }

  private eagerConfigs(pages: readonly PageNode[]): ResolvedForms {
    const pool = this.flow.forms;
    const resolved: ResolvedForms = {};
    for (const node of formNodes(pages)) {
      const entry = pool[node.name];
      if (entry && typeof entry !== 'function') resolved[node.name] = entry;
    }

    return resolved;
  }

  /** A step brought to life over the context the given navigation provides; the caller decides where it goes. */
  private materialize(pages: readonly PageNode[], configs: ResolvedForms, nav: Navigation): LiveStep {
    return materializeStep(pages, {
      pool: configs,
      shared: this.flow.shared,
      environment: this.environment,
      injector: this.injector,
      entry: this.inContext(() => this.contextOf(nav.memo)),
    });
  }

  private ownLevel(): ProgressLevel {
    const eff = this.effective();
    const node = this.current();
    const at = node ? eff.indexOf(node) : -1;
    const flow = this.recurrentFlow;
    const ring = this.ring;
    if (!flow || !ring) return linearLevel(eff, at);

    const dock = this.flow.steps[flow.dockAt];
    const passSteps = eff.filter((candidate) => candidate !== dock);
    const passAt = node && node !== dock ? passSteps.indexOf(node) : -1;

    return {
      kind: ProgressLevelKind.Recurrent,
      folds: ring.folds(),
      pass: ring.passOpen() ? linearLevel(passSteps, passAt) : null,
      dock: {
        label: resolveText(dock.label),
        active: node === dock,
        reachable: ring.dockReachable(),
      },
    };
  }
}

function stepKey(node: SequenceNode, index: number): string {
  return node.name ?? String(index);
}

function valuesOf(live: LiveStep): Readonly<Record<string, ReturnType<FormState['model']>>> {
  const values: Record<string, ReturnType<FormState['model']>> = {};
  for (const form of live.forms) {
    if (form.visible()) values[form.name] = form.state.model();
  }

  return values;
}

function linearLevel(steps: readonly SequenceNode[], at: number): LinearProgressLevel {
  return {
    kind: ProgressLevelKind.Linear,
    index: at,
    total: steps.length,
    steps: steps.map((step, position) => ({
      label: resolveText(step.label),
      state: stateAt(position, at),
    })),
  };
}

function stateAt(position: number, active: number): ProgressStepState {
  if (position < active) return ProgressStepState.Done;
  if (position === active) return ProgressStepState.Active;
  return ProgressStepState.Todo;
}
