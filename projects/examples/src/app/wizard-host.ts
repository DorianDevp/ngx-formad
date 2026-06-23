import {
  afterNextRender,
  Component,
  computed,
  EnvironmentInjector,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FieldTree } from '@angular/forms/signals';
import {
  FormConfig,
  FormRenderer,
  LiveStep,
  materializeStep,
  RuntimeStepper,
  SharedState,
} from 'ngx-formad';
import { FlowTheme } from './theme';

/** One field's current error, as the validation summary lists it. */
interface Issue {
  readonly label: string;
  readonly message: string;
}

// A custom-chromed wizard host built directly on ngx-formad's runtime primitives
// rather than the library's plain `StepperComponent`. It shows what those
// primitives compose into: a numbered step rail, a heading + subheading from the
// page node, live validation read straight off the native field trees, and the
// directional sync driven at the edges (commit on leave, re-seed on entry).
//
// Validation is the showcase here. Every field error already surfaces inline on
// blur (the default controls do that). On top of that, pressing Continue while
// the step is invalid marks every field touched and reveals a summary banner that
// lists each error by label — so nothing can be missed and the schema messages in
// forms.ts are all on screen at once.
@Component({
  selector: 'app-wizard',
  imports: [FormRenderer],
  template: `
    <div class="wiz-head">
      <div class="prog">
        <span class="prog-badge"><i class="ti" [class]="theme().icon"></i>{{ theme().label }}</span>
        <span class="prog-step">Step {{ index() + 1 }} of {{ total() }}</span>
      </div>
      <div class="rail">
        @for (n of steps(); track n) {
          <div class="rail-dot" [class.done]="n < index()" [class.active]="n === index()">
            @if (n < index()) {
              <i class="ti ti-check"></i>
            } @else {
              {{ n + 1 }}
            }
          </div>
          @if (!$last) {
            <div class="rail-bar" [class.done]="n < index()"></div>
          }
        }
      </div>
    </div>

    <div class="scroll">
      <div class="content">
        <h1 class="step-title">{{ heading() }}</h1>
        @if (subheading()) {
          <p class="step-sub">{{ subheading() }}</p>
        }

        @if (prefilled()) {
          <div class="banner banner-info">
            <i class="ti ti-wand"></i>
            <span>We pre-filled a few fields from earlier steps. You can change them.</span>
          </div>
        }

        @if (showErrors() && issues().length) {
          <div class="banner banner-error">
            <i class="ti ti-alert-triangle"></i>
            <div>
              <strong
                >{{ issues().length }}
                {{ issues().length === 1 ? 'field needs' : 'fields need' }} attention</strong
              >
              <ul>
                @for (issue of issues(); track issue.label) {
                  <li><b>{{ issue.label }}:</b> {{ issue.message }}</li>
                }
              </ul>
            </div>
          </div>
        }

        @if (current(); as step) {
          @for (form of step.forms; track form.name) {
            <ngx-formad-form [state]="form.state" />
          }
        }
      </div>
    </div>

    <div class="nav">
      <button class="btn btn-ghost" type="button" (click)="back()">
        <i class="ti ti-arrow-left"></i> Back
      </button>
      <div class="nav-main">
        @if (showErrors() && issues().length) {
          <span class="nav-hint"><i class="ti ti-info-circle"></i> Fix the fields above to continue</span>
        }
        <button class="btn btn-accent" type="button" (click)="next()">
          {{ isLast() ? 'Submit request' : 'Continue' }}
          <i class="ti" [class]="isLast() ? 'ti-send' : 'ti-arrow-right'"></i>
        </button>
      </div>
    </div>
  `,
})
export class WizardHost {
  /** The built wizard, from one of the flow builders. */
  readonly stepper = input.required<RuntimeStepper>();
  /** Accent + labels for this flow. */
  readonly theme = input.required<FlowTheme>();
  /** Emitted when the final step is submitted. */
  readonly finished = output<void>();
  /** Emitted when the user backs out past the first step. */
  readonly exited = output<void>();

  private readonly injector = inject(EnvironmentInjector);
  private readonly liveStep = signal<LiveStep | null>(null);
  private readonly prefilledNow = signal(false);
  private readonly showErrorsNow = signal(false);
  // Retain materialized steps so a revisit keeps user edits.
  private readonly cache = new Map<number, LiveStep>();

  protected readonly index = signal(0);
  protected readonly current = this.liveStep.asReadonly();
  protected readonly prefilled = this.prefilledNow.asReadonly();
  protected readonly showErrors = this.showErrorsNow.asReadonly();
  protected readonly total = computed(() => this.stepper().steps.length);
  protected readonly steps = computed(() => Array.from({ length: this.total() }, (_, i) => i));
  protected readonly isLast = computed(() => this.index() === this.total() - 1);

  private readonly pageOptions = computed(
    () => this.stepper().steps[this.index()]?.pages[0]?.options,
  );
  protected readonly heading = computed(() => this.pageOptions()?.heading ?? '');
  protected readonly subheading = computed(() => this.pageOptions()?.subheading ?? '');
  protected readonly complete = computed(() => this.liveStep()?.registry.completed() ?? false);

  // Every current error of the step, read live off the native field trees and
  // paired with its field label. This drives the summary banner and the gate.
  protected readonly issues = computed<Issue[]>(() => {
    const step = this.liveStep();
    if (!step) return [];
    const out: Issue[] = [];
    for (const form of step.forms) {
      const root = form.state.rootForm as unknown as Record<string, FieldTree<unknown>>;
      for (const field of form.state.fields) {
        // Resolve the leaf by its full path so nested-group fields work too.
        const errors = resolveLeaf(root, field.path).errors();
        if (errors.length) {
          out.push({
            label: field.node.label ?? field.key,
            message: errors[0]?.message ?? 'Invalid value',
          });
        }
      }
    }
    return out;
  });

  constructor() {
    // The input is set by first render; materialize the entry step then (outside
    // any reactive context, so `form()` is safe to call).
    afterNextRender(() => this.enter(0));
  }

  protected next(): void {
    const step = this.liveStep();
    // Gate on the registry's completion fold. If the step is invalid, reveal the
    // errors instead of advancing — that is the showcase, not a dead-end alert.
    if (step && !this.complete()) {
      this.markAllTouched(step);
      this.showErrorsNow.set(true);
      return;
    }
    this.commitCurrent();
    if (this.isLast()) {
      this.finished.emit();
    } else {
      this.enter(this.index() + 1);
    }
  }

  protected back(): void {
    this.commitCurrent();
    if (this.index() === 0) {
      this.exited.emit();
    } else {
      this.enter(this.index() - 1);
    }
  }

  // field -> shared for the step being left.
  private commitCurrent(): void {
    const step = this.liveStep();
    if (step) for (const form of step.forms) form.commit();
  }

  private markAllTouched(step: LiveStep): void {
    for (const form of step.forms) {
      const root = form.state.rootForm as unknown as Record<string, FieldTree<unknown>>;
      for (const field of form.state.fields) resolveLeaf(root, field.path).markAsTouched();
    }
  }

  private enter(target: number): void {
    this.index.set(target);
    this.showErrorsNow.set(false);
    let live = this.cache.get(target);
    if (live) {
      for (const form of live.forms) form.seed();
    } else {
      const wizard = this.stepper();
      const pool = wizard.forms as Record<string, FormConfig<Record<string, unknown>>>;
      const shared = wizard.shared as SharedState<Record<string, unknown>>;
      live = materializeStep(wizard.steps[target], pool, shared, this.injector);
      this.cache.set(target, live);
    }
    this.liveStep.set(live);
    // A fresh form starts empty, so any non-empty value here came from a seed —
    // that is exactly the directional autofill we want to flag to the user.
    this.prefilledNow.set(
      untracked(() => live.forms.some((f) => Object.values(f.state.model()).some(filled))),
    );
  }
}

function filled(value: unknown): boolean {
  return typeof value === 'string' ? value.length > 0 : Boolean(value);
}

// Walks the native field tree to a leaf by its path (`['address','city']`) and
// returns its field state — so a nested-group field reads the same as a top-level
// one. `FieldTree` is both callable (→ field state) and indexable (→ child tree).
function resolveLeaf(root: Record<string, FieldTree<unknown>>, path: readonly string[]) {
  let node: FieldTree<unknown> = root[path[0]];
  for (let i = 1; i < path.length; i++) {
    node = (node as unknown as Record<string, FieldTree<unknown>>)[path[i]];
  }
  return node();
}
