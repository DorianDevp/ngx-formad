import {
  computed,
  createEnvironmentInjector,
  EnvironmentInjector,
  resource,
  ResourceRef,
  runInInjectionContext,
  signal,
  Signal,
  untracked,
} from '@angular/core';
import { PageNode, SequenceNodeKind, StepNode } from '../builders/nodes';
import {
  FlowStepNode,
  isFlowStep,
  isRecurrent,
  RecurrentFlowDefinition,
  RuntimeFlow,
  SequenceNode,
} from '../builders/flow';
import { Reactive, toGetter } from '../builders/dynamic-component';
import {
  DeferTrigger,
  ErasedRecord,
  ErasedValue,
  RecurrentSignals,
  RuntimeStepContext,
  RuntimeStepInstance,
  RuntimeSteps,
  SharedSignals,
} from '../builders/step-context';
import { FormConfig } from '../form-config/form-config';
import { effectiveSteps } from './effective-sequence';
import { FlowRing } from './flow-ring';
import {
  LiveStep,
  materializeStep,
  resolvePages,
  resolveStepForms,
  StepIssue,
  stepFormNames,
} from './materialize-step';

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

  shared(): SharedSignals<ErasedRecord>;

  flow(): RecurrentSignals | undefined;

  advanceOut(): void;

  backOut(): void;

  canBackOut(): boolean;

  committedBelow(): void;
}

/** What a controller is hosted by: its parent environment, completion and commit callbacks, or a parent outlet. */
export interface ControllerHost {
  readonly environment: EnvironmentInjector;

  readonly onComplete?: (result: ErasedValue) => void;

  readonly onStep?: (values: ErasedRecord) => void;

  readonly outlet?: FlowOutlet;
}

/** The headless stepper engine a chrome renders: leaf state, navigation, progress and egress. */
export interface StepperController {
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

  readonly result: Signal<ErasedValue>;

  readonly committed: Signal<ErasedRecord>;

  next(): void;

  back(): void;

  skip(): void;

  goTo(target: number | string, options?: GoToOptions): void;

  destroy(): void;

  reset(): void;

  dockRestart(): void;
}

function resolveText(value: Reactive<string> | undefined): string {
  return toGetter(value ?? '')();
}

type ResolvedForms = Record<string, FormConfig<ErasedRecord>>;

type StepMemo = ReadonlyMap<StepNode, LiveStep>;

interface LazyStep {
  readonly node: StepNode;

  readonly pages: readonly PageNode[];

  readonly configs: ResolvedForms;
}

export class FormadStepperController implements StepperController {
  private readonly cursor = signal<SequenceNode | null>(null);

  private readonly attemptedNext = signal(false);

  private readonly ring: FlowRing | null;

  private readonly recurrentFlow: RecurrentFlowDefinition | null;

  private readonly children: ReadonlyMap<FlowStepNode, FormadStepperController>;

  private readonly memo = signal<StepMemo>(new Map());

  private lastShown: StepNode | null = null;

  private readonly lazyForms: ResourceRef<LazyStep | undefined>;

  readonly environment: EnvironmentInjector;

  private readonly contextShared: SharedSignals<ErasedRecord>;

  private readonly contextFlow: RecurrentSignals | undefined;

  private readonly outlet: FlowOutlet | undefined;

  private readonly onComplete: ((result: ErasedValue) => void) | undefined;

  private readonly onStep: ((values: ErasedRecord) => void) | undefined;

  constructor(
    private readonly flow: RuntimeFlow,
    host: ControllerHost,
  ) {
    this.outlet = host.outlet;
    this.onComplete = host.onComplete;
    this.onStep = host.onStep;
    this.environment = createEnvironmentInjector([...flow.providers], host.environment, 'formad-flow');
    this.recurrentFlow = isRecurrent(flow) ? flow : null;
    this.ring = this.recurrentFlow ? new FlowRing(this.recurrentFlow) : null;
    this.contextShared = { ...(host.outlet?.shared() ?? {}), ...sharedSignalsOf(flow) };
    this.contextFlow = this.ring
      ? { state: this.ring.state, passOpen: this.ring.passOpen }
      : host.outlet?.flow();
    this.children = this.spawnChildren();
    this.lazyForms = resource({
      params: () => this.lazyTarget(),
      loader: async ({ params }) => {
        const pages = untracked(() => this.pagesFor(params));

        return { node: params, pages, configs: await resolveStepForms(pages, this.flow.forms) };
      },
      injector: this.environment,
    });
  }

  private inContext<T>(compute: () => T): T {
    return runInInjectionContext(this.environment, compute);
  }

  private readonly stepsView = computed<RuntimeSteps>(() => {
    const memo = this.memo();

    return Object.fromEntries(
      this.flow.steps.map((node, index) => [
        stepKey(node, index),
        isFlowStep(node) ? this.children.get(node)?.egress() : memo.get(node)?.instances,
      ]),
    );
  });

  private context(): RuntimeStepContext {
    return {
      steps: this.stepsView(),
      shared: this.contextShared,
      flow: this.contextFlow,
      parent: this.outlet?.context(),
    };
  }

  private entryContext(upTo: SequenceNode | null): RuntimeStepContext {
    const steps = this.flow.steps;
    const limit = upTo ? steps.indexOf(upTo) : steps.length;
    for (const node of steps.slice(0, limit)) {
      if (isFlowStep(node) || node.when || this.memo().has(node)) continue;
      if (this.hasLazyForms(this.pagesFor(node))) continue;

      this.materialize(node, { pages: this.pagesFor(node), configs: this.eagerConfigs(this.pagesFor(node)) });
    }

    return this.context();
  }

  private readonly effective = computed(() =>
    this.inContext(() => effectiveSteps(this.flow.steps, this.context())),
  );

  private readonly current = computed<SequenceNode | null>(() => {
    const eff = this.effective();
    const wanted = this.cursor();
    if (!wanted) return eff[0] ?? null;
    if (eff.includes(wanted)) return wanted;

    const steps = this.flow.steps;
    const origin = steps.indexOf(wanted);
    let target: SequenceNode | undefined;
    for (const candidate of eff) {
      if (steps.indexOf(candidate) <= origin) target = candidate;
      else break;
    }

    return target ?? eff[0] ?? null;
  });

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

  private readonly lazyTarget = computed<StepNode | undefined>(() => {
    const node = this.currentStep();
    if (!node || this.memo().has(node)) return undefined;
    return untracked(() => this.hasLazyForms(this.pagesFor(node))) ? node : undefined;
  });

  private readonly ownStep = computed<LiveStep | null>(() => {
    const node = this.currentStep();
    if (!node) return null;

    const cached = this.memo().get(node);
    if (cached) return untracked(() => this.showCached(node, cached));

    const pages = untracked(() => this.pagesFor(node));

    if (this.hasLazyForms(pages)) {
      const resolved = this.lazyForms.hasValue() ? this.lazyForms.value() : undefined;
      if (!resolved || resolved.node !== node) return null;
      return untracked(() => this.materialize(node, { pages: resolved.pages, configs: resolved.configs }));
    }

    return untracked(() => this.materialize(node, { pages, configs: this.eagerConfigs(pages) }));
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

  readonly committed: Signal<ErasedRecord> = computed(() => {
    const memo = this.memo();
    const values: Record<string, ErasedValue> = {};
    this.flow.steps.forEach((node, index) => {
      if (isFlowStep(node)) {
        values[stepKey(node, index)] = this.children.get(node)?.egress();
        return;
      }

      const live = memo.get(node);
      if (live) values[stepKey(node, index)] = valuesOf(live);
    });

    return values;
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
    return child ? child.nextBlocked() : this.attemptedNext() && !this.ownCanNext();
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

  readonly result = computed<ErasedValue>(() => {
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

    if (options?.fresh) this.discardFrom(node);
    this.enter(node);
  }

  reset(): void {
    this.flow.shared.reset();
    this.attemptedNext.set(false);
    this.memo.set(new Map());
    this.lastShown = null;
    for (const child of this.children.values()) child.reset();
    this.ring?.reset();
    this.cursor.set(null);
  }

  dockRestart(): void {
    this.dockController()?.restartPass();
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
    this.attemptedNext.set(true);
  }

  private advanceSelf(): void {
    const from = this.current();
    this.commitCurrent();
    if (from && this.foldsAfter(from)) {
      this.inContext(() => this.ring?.fold(untracked(() => this.entryContext(null))));
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
    if (from && this.insideOpenPass(from)) this.discardStep(from);
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

  private discardStep(node: SequenceNode): void {
    if (isFlowStep(node)) {
      this.children.get(node)?.reset();
      return;
    }

    this.memo.update((memo) => without(memo, [node]));
    if (this.lastShown === node) this.lastShown = null;
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
    const passSteps = steps.slice(0, flow.dockAt);
    for (const node of passSteps) {
      if (isFlowStep(node)) this.children.get(node)?.reset();
    }
    this.memo.update((memo) => without(memo, passSteps));
    if (this.lastShown && steps.indexOf(this.lastShown) < flow.dockAt) this.lastShown = null;
    this.flow.shared.reset();
    ring.openPass();

    const first = this.effective().find((node) => steps.indexOf(node) < flow.dockAt);
    if (first) this.enter(first);
  }

  private dockController(): FormadStepperController | null {
    const child = this.child();
    if (child) return child.dockController();

    const flow = this.recurrentFlow;
    if (!flow) return null;
    return this.current() === this.flow.steps[flow.dockAt] ? this : null;
  }

  private enter(node: SequenceNode): void {
    this.cursor.set(node);
    this.attemptedNext.set(false);
  }

  private discardFrom(node: SequenceNode): void {
    const steps = this.flow.steps;
    const origin = steps.indexOf(node);
    if (origin < 0) return;

    const dropped = steps.slice(origin);
    for (const candidate of dropped) {
      if (isFlowStep(candidate)) this.children.get(candidate)?.reset();
    }
    this.memo.update((memo) => without(memo, dropped));
    if (this.lastShown && steps.indexOf(this.lastShown) >= origin) this.lastShown = null;
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

    const live = this.memo().get(node);
    if (!live) return;

    for (const form of live.forms) if (form.visible()) form.commit();

    this.notifyCommitted();
  }

  private egress(): ErasedValue {
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

    return new FormadStepperController(node.flow, { environment: this.environment, outlet });
  }

  private pagesFor(node: StepNode): readonly PageNode[] {
    if (typeof node.pages !== 'function') return node.pages;

    return this.inContext(() => resolvePages(node, this.entryContext(node)));
  }

  private hasLazyForms(pages: readonly PageNode[]): boolean {
    const pool = this.flow.forms;
    return stepFormNames(pages).some((name) => typeof pool[name] === 'function');
  }

  private eagerConfigs(pages: readonly PageNode[]): ResolvedForms {
    const pool = this.flow.forms;
    const resolved: ResolvedForms = {};
    for (const name of stepFormNames(pages)) {
      const entry = pool[name];
      if (entry && typeof entry !== 'function') resolved[name] = entry;
    }

    return resolved;
  }

  private showCached(node: StepNode, cached: LiveStep): LiveStep {
    if (this.lastShown !== node) {
      for (const form of cached.forms) form.seed();
      this.lastShown = node;
    }

    return cached;
  }

  private materialize(node: StepNode, resolved: { pages: readonly PageNode[]; configs: ResolvedForms }): LiveStep {
    const live = materializeStep(resolved.pages, {
      pool: resolved.configs,
      shared: this.flow.shared,
      environment: this.environment,
      entry: this.inContext(() => this.entryContext(node)),
    });
    this.memo.update((memo) => new Map(memo).set(node, live));
    this.lastShown = node;
    return live;
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

function valuesOf(live: LiveStep): ErasedRecord {
  const values: Record<string, ErasedValue> = {};

  for (const form of live.forms) {
    if (form.visible()) values[form.name] = form.state.model();
  }

  return values;
}

function without(memo: StepMemo, nodes: readonly SequenceNode[]): StepMemo {
  const next = new Map(memo);
  for (const node of nodes) {
    if (!isFlowStep(node)) next.delete(node);
  }

  return next;
}

function sharedSignalsOf(flow: RuntimeFlow): SharedSignals<ErasedRecord> {
  const signals: Record<string, Signal<ErasedValue>> = {};
  for (const key of Object.keys(flow.shared.snapshot())) signals[key] = flow.shared.select(key);

  return signals;
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
