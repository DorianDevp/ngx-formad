import {
  afterNextRender,
  Component,
  computed,
  effect,
  EnvironmentInjector,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { StepNode } from '../builders/nodes';
import { RuntimeStepper } from '../builders/stepper-builder';
import { AnyFormProvider, RuntimeStepContext } from '../builders/step-context';
import { FormConfig } from '../form-config/form-config';
import { FormRenderer } from '../renderer/form-renderer';
import { SharedState } from '../sync/shared-state';
import { effectiveSteps } from './effective-sequence';
import { LiveStep, materializeStep, resolveStepForms, stepFormNames } from './materialize-step';

// Renders one live step's forms. Split out so it can be the body of an `@defer`
// block without repeating the loop per trigger.
@Component({
  selector: 'ngx-formad-step-forms',
  imports: [FormRenderer],
  template: `
    @for (form of step().forms; track form.name) {
      <ngx-formad-form [state]="form.state" />
    }
  `,
})
export class StepFormsView {
  readonly step = input.required<LiveStep>();
}

// A working multi-step shell. Beyond rendering the current step and driving the
// directional sync at the edges (commit on leave, re-seed on entry), it resolves
// the **effective sequence**: steps are filtered by their `when` condition, so a
// hidden step simply is not in the list and navigation skips over it. Conditions
// read a typed-but-reactive context — the live shared state plus each prior step's
// last-committed model — so flipping a value re-shapes the path live. Optional
// steps get a Skip that bypasses the completion gate, and a step may load its form
// config lazily and/or render inside `@defer`.
//
// Steps are materialized lazily and cached by node identity (not index), so the
// effective list can change shape without invalidating already-built steps.
@Component({
  selector: 'ngx-formad-stepper',
  imports: [FormRenderer, StepFormsView],
  template: `
    @if (loading()) {
      <div class="ngx-formad-loading">Loading…</div>
    } @else if (live(); as step) {
      <section class="ngx-formad-step">
        @switch (deferTrigger()) {
          @case ('viewport') {
            @defer (on viewport) {
              <ngx-formad-step-forms [step]="step" />
            } @placeholder {
              <div class="ngx-formad-defer"></div>
            }
          }
          @case ('interaction') {
            @defer (on interaction) {
              <ngx-formad-step-forms [step]="step" />
            } @placeholder {
              <div class="ngx-formad-defer"></div>
            }
          }
          @case ('idle') {
            @defer (on idle) {
              <ngx-formad-step-forms [step]="step" />
            } @placeholder {
              <div class="ngx-formad-defer"></div>
            }
          }
          @default {
            <ngx-formad-step-forms [step]="step" />
          }
        }
      </section>
    }
    <nav class="ngx-formad-nav">
      <button type="button" [disabled]="!canBack()" (click)="back()">Back</button>
      @if (optional()) {
        <button type="button" (click)="skip()">Skip</button>
      }
      <button type="button" [disabled]="!canNext()" (click)="next()">
        {{ isLast() ? 'Finish' : 'Next' }}
      </button>
    </nav>
  `,
})
export class StepperComponent {
  /** The built wizard, widened with `asStepper(...)`. */
  readonly stepper = input.required<RuntimeStepper>();

  private readonly injector = inject(EnvironmentInjector);
  private readonly currentNode = signal<StepNode | null>(null);
  private readonly liveStep = signal<LiveStep | null>(null);
  private readonly loadingNow = signal(false);
  // Each form's last-committed model, the source of truth for `value(name)` in a
  // step condition. Updated on every commit (leaving a step).
  private readonly committed = signal<Record<string, Record<string, unknown>>>({});
  // Retain instances per step node so a revisit keeps user edits.
  private readonly cache = new Map<StepNode, LiveStep>();

  protected readonly live = this.liveStep.asReadonly();
  protected readonly loading = this.loadingNow.asReadonly();

  // The reactive condition context: live shared snapshot + committed values. Read
  // inside `effective` so the sequence re-evaluates when either changes.
  private context(): RuntimeStepContext {
    const shared = (this.stepper().shared as SharedState<Record<string, unknown>>).snapshot();
    const committed = this.committed();
    return { shared, value: (name) => committed[name] };
  }

  // The steps that pass their `when` condition, in order — what navigation walks.
  protected readonly effective = computed(() => effectiveSteps(this.stepper().steps, this.context()));

  // Position of the current step within the effective list (-1 if it dropped out).
  private readonly pos = computed(() => {
    const node = this.currentNode();
    return node ? this.effective().indexOf(node) : -1;
  });

  protected readonly canBack = computed(() => this.pos() > 0);
  protected readonly isLast = computed(() => this.pos() === this.effective().length - 1);
  // Next is enabled only when this step's live forms are all valid.
  protected readonly canNext = computed(() => this.liveStep()?.registry.completed() ?? false);
  protected readonly optional = computed(() => this.currentNode()?.optional ?? false);
  protected readonly deferTrigger = computed(() => this.currentNode()?.defer ?? null);

  constructor() {
    // The input is set by the first render; enter the first effective step then.
    // This runs outside any reactive context, so `form()` is safe to call.
    afterNextRender(() => {
      const first = this.effective()[0];
      if (first) this.enter(first);
    });

    // If a condition change drops the current step from the sequence, clamp to the
    // nearest still-visible step at or before its original position.
    effect(() => {
      const eff = this.effective();
      const node = this.currentNode();
      if (!node || eff.includes(node)) return;
      untracked(() => {
        const steps = this.stepper().steps;
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
    });
  }

  protected next(): void {
    if (this.canNext()) this.move(1);
  }

  protected skip(): void {
    if (this.optional()) this.move(1);
  }

  protected back(): void {
    this.move(-1);
  }

  private move(direction: 1 | -1): void {
    this.commitCurrent();
    const eff = this.effective();
    const target = this.pos() + direction;
    if (target >= 0 && target < eff.length) this.enter(eff[target]);
  }

  // field -> shared for the step being left, and snapshot each form's model so a
  // later step's condition can read it through `value(name)`.
  private commitCurrent(): void {
    const step = this.liveStep();
    if (!step) return;
    const snapshot = { ...this.committed() };
    for (const form of step.forms) {
      form.commit();
      snapshot[form.name] = { ...form.state.model() };
    }
    this.committed.set(snapshot);
  }

  private enter(node: StepNode): void {
    this.currentNode.set(node);
    const cached = this.cache.get(node);
    if (cached) {
      // Revisit: re-seed pristine fields so upstream changes still flow in.
      for (const form of cached.forms) form.seed();
      this.liveStep.set(cached);
      return;
    }
    const wizard = this.stepper();
    const pool = wizard.forms as unknown as Record<string, AnyFormProvider>;
    const shared = wizard.shared as SharedState<Record<string, unknown>>;
    const names = stepFormNames(node);
    const hasLazy = names.some((name) => typeof pool[name] === 'function');

    // Eager steps materialize synchronously, so navigation stays immediate. Only a
    // step with a lazily-loaded form takes the async path and shows the loading state.
    if (!hasLazy) {
      const resolved: Record<string, FormConfig<Record<string, unknown>>> = {};
      for (const name of names) {
        const entry = pool[name];
        if (entry) resolved[name] = entry as FormConfig<Record<string, unknown>>;
      }
      this.materialize(node, resolved, shared);
      return;
    }

    this.loadingNow.set(true);
    this.liveStep.set(null);
    void resolveStepForms(node, pool).then((resolved) => {
      // The step may have been navigated away from while loading; only apply if
      // it is still the current one.
      if (this.currentNode() === node) {
        this.materialize(node, resolved, shared);
        this.loadingNow.set(false);
      }
    });
  }

  private materialize(
    node: StepNode,
    resolved: Record<string, FormConfig<Record<string, unknown>>>,
    shared: SharedState<Record<string, unknown>>,
  ): void {
    const live = materializeStep(node, resolved, shared, this.injector);
    this.cache.set(node, live);
    this.liveStep.set(live);
  }
}
