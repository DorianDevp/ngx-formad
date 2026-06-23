import {
  afterNextRender,
  Component,
  computed,
  EnvironmentInjector,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormConfig } from '../form-config/form-config';
import { FormRenderer } from '../renderer/form-renderer';
import { RuntimeStepper } from '../builders/stepper-builder';
import { SharedState } from '../sync/shared-state';
import { LiveStep, materializeStep } from './materialize-step';

// A working multi-step shell. It renders the current step's forms, gates Next on
// that step's completion fold, and drives the directional sync at the edges:
// commit on leave, re-seed pristine fields on (re)entry. Steps are materialized
// lazily and retained — so a revisit re-prefills untouched fields and keeps
// edited ones — which, with directional sync, makes retain-vs-recreate a pure
// memory choice rather than a correctness one.
//
// It deliberately renders forms, not arbitrary page nodes: dynamic components and
// nested rows are available through the lower-level nodes for a custom page
// renderer. This shell covers the common form-centric wizard.
@Component({
  selector: 'ngx-formad-stepper',
  imports: [FormRenderer],
  template: `
    @if (current(); as step) {
      <section class="ngx-formad-step">
        @for (form of step.forms; track form.name) {
          <ngx-formad-form [state]="form.state" />
        }
      </section>
      <nav class="ngx-formad-nav">
        <button type="button" [disabled]="!canBack()" (click)="back()">Back</button>
        <button type="button" [disabled]="!canNext()" (click)="next()">
          {{ isLast() ? 'Finish' : 'Next' }}
        </button>
      </nav>
    }
  `,
})
export class StepperComponent {
  /** The built wizard, widened with `asStepper(...)`. */
  readonly stepper = input.required<RuntimeStepper>();

  private readonly injector = inject(EnvironmentInjector);
  private readonly index = signal(0);
  private readonly liveStep = signal<LiveStep | null>(null);
  // Retain instances per step so a revisit keeps user edits.
  private readonly cache = new Map<number, LiveStep>();

  protected readonly current = this.liveStep.asReadonly();
  protected readonly canBack = computed(() => this.index() > 0);
  protected readonly isLast = computed(() => this.index() === this.stepper().steps.length - 1);
  // Next is enabled only when this step's live forms are all valid.
  protected readonly canNext = computed(() => this.liveStep()?.registry.completed() ?? false);

  constructor() {
    // The input is set by the first render; materialize the entry step then.
    // This runs outside any reactive context, so `form()` is safe to call.
    afterNextRender(() => this.enter(0));
  }

  protected next(): void {
    this.commitCurrent();
    if (!this.isLast()) this.enter(this.index() + 1);
  }

  protected back(): void {
    this.commitCurrent();
    if (this.index() > 0) this.enter(this.index() - 1);
  }

  // field -> shared for the step being left, so the next step can pick it up.
  private commitCurrent(): void {
    const step = this.liveStep();
    if (step) for (const form of step.forms) form.commit();
  }

  private enter(target: number): void {
    this.index.set(target);
    const cached = this.cache.get(target);
    if (cached) {
      // Revisit: re-seed pristine fields so upstream changes still flow in.
      for (const form of cached.forms) form.seed();
      this.liveStep.set(cached);
      return;
    }
    const wizard = this.stepper();
    const pool = wizard.forms as Record<string, FormConfig<Record<string, unknown>>>;
    const shared = wizard.shared as SharedState<Record<string, unknown>>;
    const live = materializeStep(wizard.steps[target], pool, shared, this.injector);
    this.cache.set(target, live);
    this.liveStep.set(live);
  }
}
