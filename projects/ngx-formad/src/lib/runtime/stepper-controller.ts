import {
  afterNextRender,
  computed,
  effect,
  Injector,
  signal,
  Signal,
  untracked,
} from '@angular/core';
import { StepNode } from '../builders/nodes';
import { RuntimeStepper } from '../builders/stepper-builder';
import { AnyFormProvider, DeferTrigger, RuntimeStepContext } from '../builders/step-context';
import { FormConfig } from '../form-config/form-config';
import { SharedState } from '../sync/shared-state';
import { effectiveSteps } from './effective-sequence';
import { LiveStep, materializeStep, resolveStepForms, StepIssue, stepFormNames } from './materialize-step';

// The headless stepper engine — all orchestration, no chrome. A chrome component
// reads these signals and calls these actions; swapping the chrome (the third
// adapter axis) never touches this. It is built once per wizard and is the thing
// that keeps the suite fast:
//
//  • Nothing is built ahead of time. `build()` on the chain is data-only; this
//    controller materializes only the *current* step, caches it by node identity,
//    and re-seeds (never rebuilds) on revisit. Later steps never exist until
//    reached.
//  • Conditions are evaluated at navigation boundaries, not per keystroke: bound
//    values commit to shared on move, and `value()` is the last-committed snapshot,
//    so typing touches only the focused field — the orchestrator stays idle.
//  • Navigation costs a frame only when there is something to wait for. A step whose
//    forms are all eager materializes synchronously in `enter`, so it appears at once;
//    a step with a lazy form shows the one-frame placeholder and builds in the following
//    `afterNextRender`, off the event's critical path. Cached steps are instant.
export interface StepperController {
  /** The current step's live forms, or null while it is (re)building. */
  readonly step: Signal<LiveStep | null>;
  /** True for the frame between leaving a step and the next one's forms mounting. */
  readonly loading: Signal<boolean>;
  /** Zero-based position within the effective (condition-filtered) sequence. */
  readonly index: Signal<number>;
  /** Length of the effective sequence. */
  readonly total: Signal<number>;
  readonly heading: Signal<string>;
  readonly subheading: Signal<string>;
  readonly canBack: Signal<boolean>;
  /** The completion gate: every visible form and control on the step is valid. */
  readonly canNext: Signal<boolean>;
  /** True after the user tried Next while the gate was closed, until it opens —
   *  the "show why" flag a chrome renders `blockers` under. */
  readonly nextBlocked: Signal<boolean>;
  /** Why Next is blocked, labeled and human-readable: every visible invalid
   *  field/control's errors, plus the step's `incompleteMessage` when its
   *  `completeWhen` guard is what holds. Empty unless `nextBlocked`. */
  readonly blockers: Signal<readonly StepIssue[]>;
  readonly isLast: Signal<boolean>;
  readonly optional: Signal<boolean>;
  readonly deferTrigger: Signal<DeferTrigger | null>;
  /** The active fork arm's result, or null (no fork / no arm chosen yet). */
  readonly result: Signal<unknown>;
  /** Every last-committed value, keyed by pool name: a form commits its model
   *  record, a standalone control its raw value. Updated on each navigation
   *  (Next / Back / Skip) — the data-egress a host reads to persist a step's
   *  values without waiting for the final `completed`. */
  readonly committed: Signal<Record<string, unknown>>;
  next(): void;
  back(): void;
  skip(): void;
  /** Restarts the wizard: clears committed values and cached step instances,
   *  resets the shared state to its initial values, and re-enters the first step
   *  with fresh (factory-built) forms. */
  reset(): void;
}

export class FormadStepperController implements StepperController {
  private readonly currentNode = signal<StepNode | null>(null);
  private readonly liveStep = signal<LiveStep | null>(null);
  // Starts true so the first frame shows the placeholder, not an empty shell.
  private readonly loadingNow = signal(true);
  // Each form's/control's last-committed value — the source of truth for
  // `value(name)` and for the public `committed` egress signal.
  private readonly committedModels = signal<Record<string, unknown>>({});
  // Set by a Next that found the gate closed; cleared on entering a step. The
  // public `nextBlocked` derives from it AND the live gate, so the moment the
  // user fixes the last problem the blocker display retracts on its own.
  private readonly attemptedNext = signal(false);
  // Retain instances per step node so a revisit keeps user edits.
  private readonly cache = new Map<StepNode, LiveStep>();

  readonly step = this.liveStep.asReadonly();
  readonly loading = this.loadingNow.asReadonly();
  readonly committed = this.committedModels.asReadonly();

  // The reactive condition context: live shared snapshot + committed values.
  private context(): RuntimeStepContext {
    const shared = (this.stepper.shared as SharedState<Record<string, unknown>>).snapshot();
    const committed = this.committedModels();
    return { shared, value: (name) => committed[name] };
  }

  private readonly effective = computed(() => effectiveSteps(this.stepper.steps, this.context()));
  private readonly position = computed(() => {
    const node = this.currentNode();
    return node ? this.effective().indexOf(node) : -1;
  });
  private readonly options = computed(() => this.currentNode()?.pages[0]?.options);

  readonly index = this.position;
  readonly total = computed(() => this.effective().length);
  readonly canBack = computed(() => this.position() > 0);
  readonly isLast = computed(() => this.position() === this.effective().length - 1);
  // The completion gate: every visible form valid (the fold) AND, when present,
  // the step's own `completeWhen` — the hook for a component-driven step that has
  // no fields to fold but still gates Next on its own state. The guard gets the
  // same context as `when`, so it can read shared state and committed values.
  readonly canNext = computed(() => {
    const formsComplete = this.liveStep()?.registry.completed() ?? false;
    const guard = this.currentNode()?.completeWhen;
    return formsComplete && (guard ? guard(this.context()) : true);
  });
  readonly nextBlocked = computed(() => this.attemptedNext() && !this.canNext());
  // The answer to a blocked Next: every visible form's/control's labeled errors,
  // plus the guard's own message when `completeWhen` is (also) what holds.
  readonly blockers = computed<readonly StepIssue[]>(() => {
    if (!this.nextBlocked()) return [];
    const step = this.liveStep();
    const node = this.currentNode();
    if (!step || !node) return [];
    const issues: StepIssue[] = [];
    for (const form of step.forms) if (form.visible()) issues.push(...form.issues());
    for (const control of step.controls) if (control.visible()) issues.push(...control.issues());
    if (node.completeWhen && !node.completeWhen(this.context())) {
      issues.push({
        label: this.heading() || 'Step',
        message: node.incompleteMessage ?? 'This step is not complete yet.',
      });
    }
    return issues;
  });
  readonly optional = computed(() => this.currentNode()?.optional ?? false);
  readonly deferTrigger = computed(() => this.currentNode()?.defer ?? null);
  readonly heading = computed(() => this.options()?.heading ?? '');
  readonly subheading = computed(() => this.options()?.subheading ?? '');
  // The active fork arm's result, derived from the same context conditions read.
  readonly result = computed<unknown>(() => {
    const resolve = this.stepper.resolveResult;
    return resolve ? (resolve(this.context()) ?? null) : null;
  });

  constructor(
    private readonly stepper: RuntimeStepper,
    private readonly injector: Injector,
    // Invoked when the user finishes the last step, with the (forked) result.
    private readonly onComplete?: (result: unknown) => void,
    // Invoked after each commit (Next / Back / Skip) with the committed values —
    // the shell wires it to its `stepCommitted` output.
    private readonly onStep?: (values: Record<string, unknown>) => void,
  ) {
    // Enter the first step after the first render — never during construction.
    afterNextRender(
      () => {
        const first = this.effective()[0];
        if (first) this.enter(first);
        else this.loadingNow.set(false);
      },
      { injector },
    );

    // If a condition change drops the current step, clamp to the nearest still
    // visible step at or before its original position.
    effect(
      () => {
        const eff = this.effective();
        const node = this.currentNode();
        if (!node || eff.includes(node)) return;
        untracked(() => {
          const steps = this.stepper.steps;
          const origin = steps.indexOf(node);
          let target: StepNode | undefined;
          for (const candidate of eff) {
            if (steps.indexOf(candidate) <= origin) target = candidate;
            else break;
          }
          target ??= eff[0];
          if (target) this.enter(target);
          else {
            this.currentNode.set(null);
            this.liveStep.set(null);
          }
        });
      },
      { injector },
    );
  }

  // A blocked Next is the user asking "why not?" — so answer instead of silently
  // refusing: mark everything touched (each control then shows its own errors)
  // and raise `nextBlocked`, under which the chrome renders the `blockers` list.
  next(): void {
    if (this.canNext()) {
      this.advance();
      return;
    }
    const step = this.liveStep();
    if (step) {
      for (const form of step.forms) form.touch();
      for (const control of step.controls) control.touch();
    }
    this.attemptedNext.set(true);
  }

  skip(): void {
    if (this.optional()) this.advance();
  }

  back(): void {
    this.commitCurrent();
    const eff = this.effective();
    const node = this.currentNode();
    const i = node ? eff.indexOf(node) : -1;
    if (i > 0) this.enter(eff[i - 1]);
  }

  // Commit FIRST, so a fork/branch decision made on this step lands in shared
  // before we pick the destination — then either enter the next step or, if this
  // is now the last in the (re-evaluated) sequence, complete and hand back the result.
  private advance(): void {
    this.commitCurrent();
    const eff = this.effective();
    const node = this.currentNode();
    const i = node ? eff.indexOf(node) : -1;
    if (i >= 0 && i < eff.length - 1) this.enter(eff[i + 1]);
    else this.onComplete?.(this.result());
  }

  // field -> shared for the step being left, and snapshot each form's model and
  // each control's value so a later step's condition can read them through
  // `value(name)` and a host through `committed` / the shell's `stepCommitted`.
  private commitCurrent(): void {
    const step = this.liveStep();
    if (!step) return;
    const snapshot = { ...this.committedModels() };
    for (const form of step.forms) {
      form.commit();
      snapshot[form.name] = { ...form.state.model() };
    }
    for (const control of step.controls) {
      control.commit();
      snapshot[control.name] = control.value();
    }
    this.committedModels.set(snapshot);
    this.onStep?.(snapshot);
  }

  // Restart the wizard from a clean slate: drop committed values and cached step
  // instances, restore the shared store to its initial values, then re-enter the
  // first effective step — which rebuilds its forms from their model factories.
  reset(): void {
    (this.stepper.shared as SharedState<Record<string, unknown>>).reset();
    this.committedModels.set({});
    this.attemptedNext.set(false);
    this.cache.clear();
    const first = this.effective()[0];
    if (first) this.enter(first);
    else {
      this.currentNode.set(null);
      this.liveStep.set(null);
      this.loadingNow.set(false);
    }
  }

  // Cached steps are re-seeded and shown straight away. A step whose forms are all eager
  // materializes synchronously, so it is built in place: deferring it would only make an
  // instant step flash a placeholder, which reads as the wizard generating each step live.
  // Only a step with a lazy form has real work to wait on, so only that one defers - the
  // click still returns immediately in the case the deferral was there for.
  private enter(node: StepNode): void {
    this.currentNode.set(node);
    // A new step starts with a clean slate — the previous step's blocked state
    // is its own, not this one's.
    this.attemptedNext.set(false);
    const cached = this.cache.get(node);
    if (cached) {
      for (const form of cached.forms) form.seed();
      for (const control of cached.controls) control.seed();
      this.liveStep.set(cached);
      this.loadingNow.set(false);
      return;
    }

    const pool = this.stepper.forms as unknown as Record<string, AnyFormProvider>;
    const hasLazy = stepFormNames(node).some((name) => typeof pool[name] === 'function');

    // An eager step materializes synchronously, so build it in place: the step appears
    // with the click instead of flashing a placeholder, which is what made every step read
    // as if it were being generated on the spot. Only a lazy step, which has real work to
    // wait on, gives up a frame to keep the click responsive.
    if (!hasLazy) {
      this.build(node, false);
      return;
    }

    this.liveStep.set(null);
    this.loadingNow.set(true);
    afterNextRender(() => this.build(node, true), { injector: this.injector });
  }

  private build(node: StepNode, hasLazy: boolean): void {
    if (this.currentNode() !== node) return; // navigated away during the frame
    const pool = this.stepper.forms as unknown as Record<string, AnyFormProvider>;
    const shared = this.stepper.shared as SharedState<Record<string, unknown>>;
    const names = stepFormNames(node);

    if (!hasLazy) {
      const resolved: Record<string, FormConfig<Record<string, unknown>>> = {};
      for (const name of names) {
        const entry = pool[name];
        if (entry) resolved[name] = entry as FormConfig<Record<string, unknown>>;
      }
      this.materialize(node, resolved, shared);
      return;
    }

    void resolveStepForms(node, pool).then((resolved) => {
      if (this.currentNode() === node) this.materialize(node, resolved, shared);
    });
  }

  private materialize(
    node: StepNode,
    resolved: Record<string, FormConfig<Record<string, unknown>>>,
    shared: SharedState<Record<string, unknown>>,
  ): void {
    const live = materializeStep(node, resolved, this.stepper.controls, shared, this.injector);
    this.cache.set(node, live);
    this.liveStep.set(live);
    this.loadingNow.set(false);
  }
}
