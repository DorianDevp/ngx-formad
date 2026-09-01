import { computed, Injector, resource, ResourceRef, signal, Signal, untracked } from '@angular/core';
import { SequenceNodeKind, StepNode } from '../builders/nodes';
import {
  FlowStepNode,
  isFlowStep,
  isRecurrent,
  RecurrentFlowDefinition,
  RuntimeFlow,
  SequenceNode,
} from '../builders/flow';
import { Reactive, toGetter } from '../builders/dynamic-component';
import { DeferTrigger, FlowContext, RuntimeStepContext } from '../builders/step-context';
import { FormConfig } from '../form-config/form-config';
import { effectiveSteps } from './effective-sequence';
import { FlowRing } from './flow-ring';
import {
  LiveStep,
  materializeStep,
  resolveStepForms,
  StepIssue,
  stepFormNames,
  stepValueNames,
} from './materialize-step';

// The headless stepper engine — all orchestration, no chrome. A chrome component
// reads these signals and calls these actions; swapping the chrome (the third
// adapter axis) never touches this.
//
//  • State is two intents (`cursor`, `attemptedNext`), the leaf commits, and — for
//    a recurrent flow — its ring. Everything else derives: the current step clamps
//    to the effective sequence in a `computed` (a step that gates itself off falls
//    back to the nearest visible one, with no repair effect), a step's live forms
//    are a memoized derivation of the current node, and a nested flow's committed
//    value is PULLED from its child controller — never pushed up by a callback.
//  • Conditions are evaluated at navigation boundaries, not per keystroke: bound
//    values commit to shared on move, and `value()` is the last-committed snapshot,
//    so typing touches only the focused field — the orchestrator stays idle.
//  • A nested flow (`createStepper` / `createRecurrentStepper`) is ONE node of this
//    sequence, driven by a child controller created eagerly per flow node (cheap:
//    signals only — steps materialize on reach, exactly like the root's). The
//    public surface is a facade: leaf-describing members delegate down the active
//    chain, wizard-scoped members (`index`, `total`, `labels`, `committed`,
//    `goTo`, `reset`) stay here. One chrome renders whatever leaf the chain
//    resolves to.

export interface GoToOptions {
  readonly fresh?: boolean;
}

// ── Progress ──
// The machine-readable shape of "where am I", one entry per controller along the
// active chain, outermost first. A chrome that renders only the root level shows
// the classic rail; one that renders the deeper levels can draw the nesting — a
// recurrent level is a pass bar with the dock as a distinct point at its end,
// reachable without walking the bar (that is what `reachable` says).

export enum ProgressStepState {
  Done = 'done',
  Active = 'active',
  Todo = 'todo',
}

export enum ProgressLevelKind {
  Linear = 'linear',
  Recurrent = 'recurrent',
}

export interface ProgressStep {
  readonly label: string;

  readonly state: ProgressStepState;
}

export interface LinearProgressLevel {
  readonly kind: ProgressLevelKind.Linear;

  readonly index: number;

  readonly total: number;

  readonly steps: readonly ProgressStep[];
}

export interface ProgressDock {
  readonly label: string;

  readonly active: boolean;

  /** The dock can be landed on without walking the pass bar — true as soon as the
   *  collection satisfies the flow's `hasAny`. */
  readonly reachable: boolean;
}

export interface RecurrentProgressLevel {
  readonly kind: ProgressLevelKind.Recurrent;

  /** Items folded so far — an array's length, else 0/1 off `hasAny`. */
  readonly collected: number;

  /** The open pass's bar; null while standing on the dock. */
  readonly pass: LinearProgressLevel | null;

  readonly dock: ProgressDock;
}

export type ProgressLevel = LinearProgressLevel | RecurrentProgressLevel;

export interface StepperProgress {
  /** The active chain, outermost first. `levels.length > 1` means nesting. */
  readonly levels: readonly ProgressLevel[];
}

/** How a child controller reaches out of its flow: the parent supplies the outer
 *  condition context and lends its own navigation for the two outward edges.
 *  Data never travels through here — the parent PULLS the child's egress. @internal */
export interface FlowOutlet {
  context(): RuntimeStepContext;

  /** The child completed — the parent advances past the flow step. */
  advanceOut(): void;

  /** The child backed out of its first step — the parent goes back. */
  backOut(): void;

  canBackOut(): boolean;

  /** A leaf committed somewhere below — the root re-emits its `stepCommitted`. */
  committedBelow(): void;
}

export interface StepperController {
  /** The active LEAF step's live forms, or null while it is (re)building. */
  readonly step: Signal<LiveStep | null>;

  /** True while the active leaf's forms are not mounted yet (a lazy form loading). */
  readonly loading: Signal<boolean>;

  /** Zero-based position within THIS flow's effective sequence — a nested flow
   *  occupies one position, however deep the active leaf sits inside it. */
  readonly index: Signal<number>;

  /** Length of this flow's effective sequence. */
  readonly total: Signal<number>;

  /** The active leaf step's `label`, or '' when it has none. */
  readonly label: Signal<string>;

  /** Every effective step's `label` at THIS level, in sequence order - a chrome's
   *  progress rail. Position N in this list is the step at position N of the flow. */
  readonly labels: Signal<readonly string[]>;

  /** The full nesting-aware progress model — see {@link StepperProgress}. */
  readonly progress: Signal<StepperProgress>;

  readonly heading: Signal<string>;

  readonly subheading: Signal<string>;

  readonly canBack: Signal<boolean>;

  /** The completion gate: every visible form and control on the leaf is valid. */
  readonly canNext: Signal<boolean>;

  /** True after the user tried Next while the gate was closed, until it opens —
   *  the "show why" flag a chrome renders `blockers` under. */
  readonly nextBlocked: Signal<boolean>;

  /** True while a validator on the leaf is still running. */
  readonly validating: Signal<boolean>;

  /** Why Next is blocked, labeled and human-readable. Empty unless `nextBlocked`. */
  readonly blockers: Signal<readonly StepIssue[]>;

  /** True when Next would finish the whole wizard — the conjunction along the
   *  active chain, and never on a pass step (there Next lands on the dock). */
  readonly isLast: Signal<boolean>;

  readonly optional: Signal<boolean>;

  readonly deferTrigger: Signal<DeferTrigger | null>;

  /** The active fork arm's result; for a recurrent root, the collection. */
  readonly result: Signal<unknown>;

  /** Every last-committed value at this level, keyed by pool name. A nested flow
   *  appears under its name: a recurrent flow's folded collection, a linear
   *  sub-flow's committed record — pulled live from its own controller. */
  readonly committed: Signal<Record<string, unknown>>;

  next(): void;

  back(): void;

  skip(): void;

  goTo(target: number | string, options?: GoToOptions): void;

  /** Restarts the wizard: clears committed values and cached step instances,
   *  resets the shared state (and a recurrent flow's ring) to its initial
   *  values, and re-enters the first step with fresh (factory-built) forms. */
  reset(): void;

  /** The dock's first ability: open a fresh pass of the innermost recurrent flow
   *  currently standing on its dock. A no-op anywhere else. (The dock's second
   *  ability — move on — is `next()`.) */
  dockRestart(): void;
}

// Reads a `Reactive<string>` *inside* the computed that wants it, through the one
// normalization the library already has: whatever signals the getter touches become
// dependencies of that computed, which is what lets a heading or a label follow
// state without the tree being re-authored.
function resolveText(value: Reactive<string> | undefined): string {
  return toGetter(value ?? '')();
}

type ResolvedForms = Record<string, FormConfig<Record<string, unknown>>>;

export class FormadStepperController implements StepperController {
  // ── The intents. Everything else derives. ──
  // The last explicitly chosen node; null before any navigation (→ first step).
  private readonly cursor = signal<SequenceNode | null>(null);

  // Set by a Next that found the gate closed; cleared on entering a step. The
  // public `nextBlocked` derives from it AND the live gate, so the moment the
  // user fixes the last problem the blocker display retracts on its own.
  private readonly attemptedNext = signal(false);

  // This level's own leaf commits, keyed by pool name — nested flows are NOT in
  // here; they are merged in by the `committed` derivation below.
  private readonly leafCommits = signal<Record<string, unknown>>({});

  // A recurrent flow's own state; null for a linear flow.
  private readonly ring: FlowRing | null;

  private readonly recurrentFlow: RecurrentFlowDefinition | null;

  // ── Structure, fixed at construction. One child controller per flow node —
  // created eagerly (cheap: signals only), reset when its slot needs a fresh run.
  private readonly children: ReadonlyMap<FlowStepNode, FormadStepperController>;

  // ── Memoization. Instances are retained per node so a revisit keeps edits. ──
  private readonly cache = new Map<StepNode, LiveStep>();

  // The node whose cached instance was last handed out — seeding on revisit
  // happens exactly on the transition, not on every read.
  private lastShown: StepNode | null = null;

  // Lazy form configs resolve through a resource keyed on the current node, so
  // every way of arriving at a lazy step (navigation, clamp, reset) starts the
  // fetch without an effect anywhere.
  private readonly lazyForms: ResourceRef<{ node: StepNode; configs: ResolvedForms } | undefined>;

  constructor(
    private readonly flow: RuntimeFlow,
    private readonly injector: Injector,
    // Invoked when the user finishes the last step, with the (forked) result —
    // for a recurrent root, the collection.
    private readonly onComplete?: (result: unknown) => void,
    // Invoked after each commit (Next / Back / Skip) with the committed values —
    // the shell wires it to its `stepCommitted` output.
    private readonly onStep?: (values: Record<string, unknown>) => void,
    // Present on a child controller: its way out of the flow. @internal
    private readonly outlet?: FlowOutlet,
  ) {
    this.recurrentFlow = isRecurrent(flow) ? flow : null;
    this.ring = this.recurrentFlow ? new FlowRing(this.recurrentFlow) : null;
    this.children = this.spawnChildren();
    this.lazyForms = resource({
      params: () => this.lazyTarget(),
      loader: async ({ params }) => ({
        node: params,
        configs: await resolveStepForms(params, this.flow.forms),
      }),
      injector,
    });
  }

  // ── The condition context: live shared snapshot + committed values, layered
  // over the parent's for a nested flow (reads go outward; writes never do). ──
  private context(): RuntimeStepContext {
    const outer = this.outlet?.context();
    const own = this.flow.shared.snapshot();
    const shared = outer ? { ...outer.shared, ...own } : own;
    const committed = this.committed();
    const ring = this.ring;
    const flowContext: FlowContext | undefined = ring
      ? { collection: ring.collection(), passOpen: ring.passOpen() }
      : outer?.flow;

    return {
      shared,
      value: (name) => (name in committed ? committed[name] : outer?.value(name)),
      flow: flowContext,
    };
  }

  private readonly effective = computed(() => effectiveSteps(this.flow.steps, this.context()));

  // The truth about "where am I": the last chosen node, clamped to what is
  // currently visible. A step that gates itself off falls back to the nearest
  // visible step at or before its authored position — derived, not repaired.
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

  // The child controller driving the nested flow the cursor stands on, if any.
  private readonly child: Signal<FormadStepperController | null> = computed(() => {
    const node = this.current();
    return node && isFlowStep(node) ? (this.children.get(node) ?? null) : null;
  });

  // ── Materialization: a memoized derivation of the current node. The Map is the
  // memo; instance creation runs untracked so a form's own signals never become
  // dependencies of the orchestrator. Only the resource read stays tracked — a
  // lazy step re-derives the moment its configs arrive. ──
  private readonly lazyTarget = computed<StepNode | undefined>(() => {
    const node = this.currentStep();
    if (!node || this.cache.has(node)) return undefined;
    return this.hasLazyForms(node) ? node : undefined;
  });

  private readonly ownStep = computed<LiveStep | null>(() => {
    const node = this.currentStep();
    if (!node) return null;
    if (this.cache.has(node)) return untracked(() => this.showCached(node));

    if (this.hasLazyForms(node)) {
      const resolved = this.lazyForms.hasValue() ? this.lazyForms.value() : undefined;
      if (!resolved || resolved.node !== node) return null;
      return untracked(() => this.materialize(node, resolved.configs));
    }

    return untracked(() => this.materialize(node, this.eagerConfigs(node)));
  });

  // ── The facade: leaf-describing members delegate down the active chain,
  // wizard-scoped members stay at this level. Every delegation is an explicit
  // branch, never `??` — a child mid-build reports null and must not fall back
  // to this level's stale material. ──

  readonly step: Signal<LiveStep | null> = computed(() => {
    const child = this.child();
    return child ? child.step() : this.ownStep();
  });

  readonly loading: Signal<boolean> = computed(() => {
    const child = this.child();
    if (child) return child.loading();
    return this.current() !== null && this.ownStep() === null;
  });

  // The full committed picture at this level: this level's own leaf commits, plus
  // every nested flow's live egress under its name — pulled, never pushed.
  readonly committed: Signal<Record<string, unknown>> = computed(() => {
    const own = this.leafCommits();
    if (!this.children.size) return own;

    const merged = { ...own };
    for (const [node, child] of this.children) merged[node.name] = child.egress();
    return merged;
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

  private readonly options = computed(() => this.currentStep()?.pages[0]?.options);

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

  // The completion gate: every visible form valid (the fold) AND, when present,
  // the step's own `completeWhen` — the hook for a component-driven step that has
  // no fields to fold but still gates Next on its own state.
  private readonly ownCanNext = computed<boolean>(() => {
    const node = this.currentStep();
    if (!node) return false;

    const formsComplete = this.ownStep()?.registry.completed() ?? false;
    const guard = node.completeWhen;
    return formsComplete && (guard ? guard(this.context()) : true);
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

  // The answer to a blocked Next: every visible form's/control's labeled errors,
  // plus the guard's own message when `completeWhen` is (also) what holds.
  readonly blockers: Signal<readonly StepIssue[]> = computed(() => {
    const child = this.child();
    if (child) return child.blockers();
    if (!this.nextBlocked()) return [];

    const step = this.ownStep();
    const node = this.currentStep();
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

    // An async validator in flight closes the gate while every field reports no
    // error, so this is the one case where the list would otherwise come back
    // empty and the chrome would draw nothing at all.
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

  // "Next finishes the wizard" — true only along the whole active chain, and never
  // on a pass step, where Next folds and lands on the dock instead.
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

  // The active fork arm's result; a recurrent root resolves to its collection.
  readonly result = computed<unknown>(() => {
    if (this.ring) return this.ring.collection();

    const resolve = this.flow.resolveResult;
    return resolve ? (resolve(this.context()) ?? null) : null;
  });

  readonly progress: Signal<StepperProgress> = computed(() => {
    const own = this.ownLevel();
    const child = this.child();
    return { levels: child ? [own, ...child.progress().levels] : [own] };
  });

  // ── Actions. Navigation is genuinely imperative — a user event moves the
  // cursor; every derived signal above follows. ──

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
    this.leafCommits.set({});
    this.attemptedNext.set(false);
    this.cache.clear();
    this.lastShown = null;
    for (const child of this.children.values()) child.reset();
    this.ring?.reset();
    this.cursor.set(null);
  }

  dockRestart(): void {
    this.dockController()?.restartPass();
  }

  // A blocked Next is the user asking "why not?" — so answer instead of silently
  // refusing: mark everything touched (each control then shows its own errors)
  // and raise `nextBlocked`, under which the chrome renders the `blockers` list.
  private nextSelf(): void {
    if (this.ownCanNext()) {
      this.advanceSelf();
      return;
    }

    const step = this.ownStep();
    if (step) {
      for (const form of step.forms) form.touch();
      for (const control of step.controls) control.touch();
    }
    this.attemptedNext.set(true);
  }

  // Commit FIRST, so a fork/branch decision made on this step lands in shared
  // before the destination is picked. A finished pass then folds — the pass gate
  // closes, the pass steps leave the sequence, and the ordinary "step gated
  // itself off" fallthrough lands on the dock, which is authored after them.
  private advanceSelf(): void {
    const from = this.current();
    this.commitCurrent();
    if (from && this.foldsAfter(from)) this.ring?.fold(this.context());

    const eff = this.effective();
    const i = from ? eff.indexOf(from) : -1;
    if (i >= 0 && i < eff.length - 1) {
      this.enter(eff[i + 1]);
      return;
    }

    // A step whose own commit gated it off drops out of the sequence, so `indexOf`
    // is -1 - which is not the same as being last. Finishing the wizard there would
    // swallow every step after it.
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
    // Inside an open pass Back is a rejection, not a move through answers: the
    // step being left is a draft, so its instance and its commits are discarded
    // (a revisit gets a factory-fresh form) and nothing lands in shared state. A
    // condition the discarded commit was holding open collapses right here — the
    // step it gated leaves the sequence with the move. Outside a pass Back keeps
    // its classic meaning and commits, like every other move.
    if (from && this.insideOpenPass(from)) this.discardStep(from);
    else this.commitCurrent();

    const eff = this.effective();
    const i = from ? eff.indexOf(from) : -1;
    if (i > 0) {
      this.enter(eff[i - 1]);
      return;
    }

    // The commit just now may have gated this very step off, which leaves it out
    // of `eff` entirely - Back then means "the last visible step authored before
    // it", not "nowhere to go".
    if (i === -1 && from) {
      const previous = this.neighbour(from, -1);
      if (previous) {
        this.enter(previous);
        return;
      }
    }

    // Backing out of the flow's first step. Mid-pass with something already
    // collected, Back abandons the draft and returns to the dock; otherwise the
    // edge leaves the flow — the parent's previous step, or nothing at the root.
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

  // ── The ring. ──

  // Advancing from `node` closes the pass instead of moving on when the node is a
  // pass step, a pass is open, and no later pass step is still effective.
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

  // A pass step of an open pass — where Back rejects instead of committing.
  private insideOpenPass(node: SequenceNode): boolean {
    const flow = this.recurrentFlow;
    if (!flow || !this.ring?.passOpen()) return false;

    const at = this.flow.steps.indexOf(node);
    return at >= 0 && at < flow.dockAt;
  }

  // Drop one step's instance and its committed values — the "never happened" move.
  private discardStep(node: SequenceNode): void {
    if (isFlowStep(node)) {
      this.children.get(node)?.reset();
      return;
    }

    this.cache.delete(node);
    this.leafCommits.update((committed) => omitKeys(committed, [...stepValueNames(node)]));
    if (this.lastShown === node) this.lastShown = null;
  }

  // Back on the pass's first step returns to the dock exactly when the dock is
  // already reachable — a non-empty collection behind an open pass.
  private dockIsBehind(): boolean {
    const flow = this.recurrentFlow;
    const ring = this.ring;
    if (!flow || !ring || !ring.passOpen()) return false;

    const node = this.current();
    if (!node || this.flow.steps.indexOf(node) >= flow.dockAt) return false;
    return ring.hasAny();
  }

  // The dock's "add another": drop the pass's instances and leaf commits, reset
  // the flow's per-pass shared state, open the ring, land on the first effective
  // pass step. The collection is untouched — only the draft is fresh.
  private restartPass(): void {
    const flow = this.recurrentFlow;
    const ring = this.ring;
    if (!flow || !ring) return;

    const steps = this.flow.steps;
    const dropped: string[] = [];
    for (const node of steps.slice(0, flow.dockAt)) {
      if (isFlowStep(node)) {
        this.children.get(node)?.reset();
        continue;
      }

      this.cache.delete(node);
      dropped.push(...stepValueNames(node));
    }

    if (this.lastShown && steps.indexOf(this.lastShown) < flow.dockAt) this.lastShown = null;
    this.flow.shared.reset();
    this.leafCommits.update((committed) => omitKeys(committed, dropped));
    ring.openPass();

    const first = this.effective().find((node) => steps.indexOf(node) < flow.dockAt);
    if (first) this.enter(first);
  }

  // The innermost recurrent controller currently standing on its dock — the one
  // a dock intent addresses.
  private dockController(): FormadStepperController | null {
    const child = this.child();
    if (child) return child.dockController();

    const flow = this.recurrentFlow;
    if (!flow) return null;
    return this.current() === this.flow.steps[flow.dockAt] ? this : null;
  }

  // ── Mechanics. ──

  private enter(node: SequenceNode): void {
    this.cursor.set(node);
    // A new step starts with a clean slate — the previous step's blocked state
    // is its own, not this one's.
    this.attemptedNext.set(false);
  }

  private discardFrom(node: SequenceNode): void {
    const steps = this.flow.steps;
    const origin = steps.indexOf(node);
    if (origin < 0) return;

    for (const cached of [...this.cache.keys()]) {
      if (steps.indexOf(cached) >= origin) this.cache.delete(cached);
    }
    for (const [flowNode, child] of this.children) {
      if (steps.indexOf(flowNode) >= origin) child.reset();
    }
    if (this.lastShown && steps.indexOf(this.lastShown) >= origin) this.lastShown = null;
  }

  // Where to go from a step that is no longer in the effective sequence: its
  // position in the *authored* order is all that is left of it, so the destination
  // is the nearest visible step after it (or before it, going back).
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

  // field -> shared for the step being left, and snapshot each form's model and
  // each control's value so a later step's condition can read them through
  // `value(name)` and a host through `committed` / the shell's `stepCommitted`.
  // Leaving a nested flow commits ITS current leaf instead — the values themselves
  // surface through the pull in `committed`.
  private commitCurrent(): void {
    const node = this.current();
    if (!node) return;

    if (isFlowStep(node)) {
      this.children.get(node)?.commitCurrent();
      return;
    }

    const live = this.cache.get(node);
    if (!live) return;

    const snapshot = { ...this.leafCommits() };
    // Only what is actually on screen commits. A hidden form is out of the
    // completion fold and out of the blocker list already; committing it too would
    // push its factory defaults into shared state and into `committed`.
    for (const form of live.forms) {
      if (!form.visible()) continue;
      form.commit();
      snapshot[form.name] = { ...form.state.model() };
    }
    for (const control of live.controls) {
      if (!control.visible()) continue;
      control.commit();
      snapshot[control.name] = control.value();
    }

    this.leafCommits.set(snapshot);
    this.notifyCommitted();
  }

  // What this flow hands its parent: a recurrent flow its collection, a linear
  // one its committed record — read live, so the parent's `committed` derivation
  // is always current with no push anywhere.
  private egress(): unknown {
    return this.ring ? this.ring.collection() : this.committed();
  }

  // The commit event bubbles to the root, which emits ONE `stepCommitted` with
  // the full merged picture. An event, not state — the data travels by pull.
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
      advanceOut: () => this.advanceSelf(),
      backOut: () => this.backSelf(),
      canBackOut: () => this.ownCanBack(),
      committedBelow: () => this.notifyCommitted(),
    };

    return new FormadStepperController(node.flow, this.injector, undefined, undefined, outlet);
  }

  private hasLazyForms(node: StepNode): boolean {
    const pool = this.flow.forms;
    return stepFormNames(node).some((name) => typeof pool[name] === 'function');
  }

  private eagerConfigs(node: StepNode): ResolvedForms {
    const pool = this.flow.forms;
    const resolved: ResolvedForms = {};
    for (const name of stepFormNames(node)) {
      const entry = pool[name];
      if (entry && typeof entry !== 'function') {
        resolved[name] = entry as FormConfig<Record<string, unknown>>;
      }
    }

    return resolved;
  }

  // A cached step is re-seeded exactly on the transition back to it — the links'
  // "seed on entry" — not on every read of the memo.
  private showCached(node: StepNode): LiveStep {
    const cached = this.cache.get(node)!;
    if (this.lastShown !== node) {
      for (const form of cached.forms) form.seed();
      for (const control of cached.controls) control.seed();
      this.lastShown = node;
    }

    return cached;
  }

  private materialize(node: StepNode, resolved: ResolvedForms): LiveStep {
    const live = materializeStep(node, resolved, this.flow.controls, this.flow.shared, this.injector);
    this.cache.set(node, live);
    this.lastShown = node;
    return live;
  }

  private ownLevel(): ProgressLevel {
    const eff = this.effective();
    const node = this.current();
    const at = node ? eff.indexOf(node) : -1;
    const flow = this.recurrentFlow;
    if (!flow) return linearLevel(eff, at);

    const ring = this.ring!;
    const dock = this.flow.steps[flow.dockAt];
    const passSteps = eff.filter((candidate) => candidate !== dock);
    const passAt = node && node !== dock ? passSteps.indexOf(node) : -1;
    const collection = ring.collection();

    return {
      kind: ProgressLevelKind.Recurrent,
      collected: Array.isArray(collection) ? collection.length : ring.hasAny() ? 1 : 0,
      pass: ring.passOpen() ? linearLevel(passSteps, passAt) : null,
      dock: {
        label: resolveText(dock.label),
        active: node === dock,
        reachable: ring.hasAny(),
      },
    };
  }
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

function omitKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  if (!keys.length) return record;

  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!keys.includes(key)) kept[key] = value;
  }

  return kept;
}
