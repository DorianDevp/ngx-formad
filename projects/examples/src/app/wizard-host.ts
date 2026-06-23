import { Component, computed, effect, EnvironmentInjector, inject, input, OnInit, output, signal, untracked } from '@angular/core';
import { FieldTree } from '@angular/forms/signals';
import { FormadStepperController, FormRenderer, RuntimeStepper, StepperController } from 'ngx-formad';
import { FlowTheme } from './theme';

/** One field's current error, as the validation summary lists it. */
interface Issue {
  readonly label: string;
  readonly message: string;
}

// A custom wizard *chrome* built over the library's headless `StepperController`.
// It owns only the look — a numbered rail, heading/subheading, banners, a
// validation summary, and the nav — and reads everything else (the effective
// step sequence, the completion gate, optional/skip, conditional steps and forks,
// the deferred build, the fork result) off the controller. This is the
// bring-your-own-UI path: all the orchestration the bundled shell does, with our
// chrome instead, and none of it re-implemented here.
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

        @if (loading()) {
          <div class="banner banner-info"><i class="ti ti-loader-2"></i><span>Loading…</span></div>
        } @else if (current(); as step) {
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
        @if (optional()) {
          <button class="btn btn-ghost" type="button" (click)="skip()">Skip</button>
        }
        <button class="btn btn-accent" type="button" (click)="next()">
          {{ isLast() ? 'Submit request' : 'Continue' }}
          <i class="ti" [class]="isLast() ? 'ti-send' : 'ti-arrow-right'"></i>
        </button>
      </div>
    </div>
  `,
})
export class WizardHost implements OnInit {
  /** The built wizard, from one of the flow builders. */
  readonly stepper = input.required<RuntimeStepper>();
  /** Accent + labels for this flow. */
  readonly theme = input.required<FlowTheme>();
  /** Emitted when the final step is submitted, carrying any forked result. */
  readonly finished = output<unknown>();
  /** Emitted when the user backs out past the first step. */
  readonly exited = output<void>();

  private readonly injector = inject(EnvironmentInjector);
  private readonly ctrl = signal<StepperController | null>(null);
  private readonly showErrorsNow = signal(false);

  // Thin projections of the controller's signals, with null-safe defaults for the
  // first frame before the controller is constructed in ngOnInit.
  protected readonly index = computed(() => this.ctrl()?.index() ?? 0);
  protected readonly total = computed(() => this.ctrl()?.total() ?? 0);
  protected readonly steps = computed(() => Array.from({ length: this.total() }, (_, i) => i));
  protected readonly isLast = computed(() => this.ctrl()?.isLast() ?? false);
  protected readonly heading = computed(() => this.ctrl()?.heading() ?? '');
  protected readonly subheading = computed(() => this.ctrl()?.subheading() ?? '');
  protected readonly canNext = computed(() => this.ctrl()?.canNext() ?? false);
  protected readonly optional = computed(() => this.ctrl()?.optional() ?? false);
  protected readonly loading = computed(() => this.ctrl()?.loading() ?? false);
  protected readonly current = computed(() => this.ctrl()?.step() ?? null);
  protected readonly showErrors = this.showErrorsNow.asReadonly();

  // A fresh form is empty, so any non-empty value came from a directional seed —
  // exactly the cross-step autofill we flag to the user.
  protected readonly prefilled = computed(() => {
    const step = this.current();
    return !!step && step.forms.some((f) => Object.values(f.state.model()).some(filled));
  });

  // Every current error of the step, read live off the native field trees (by
  // path, so nested-group fields work) and paired with its label.
  protected readonly issues = computed<Issue[]>(() => {
    const step = this.current();
    if (!step) return [];
    const out: Issue[] = [];
    for (const form of step.forms) {
      const root = form.state.rootForm as unknown as Record<string, FieldTree<unknown>>;
      for (const field of form.state.fields) {
        const errors = resolveLeaf(root, field.path).errors();
        if (errors.length) {
          out.push({ label: field.node.label ?? field.key, message: errors[0]?.message ?? 'Invalid value' });
        }
      }
    }
    return out;
  });

  constructor() {
    // Clear the error summary whenever the step changes (an advance/back), so it
    // only shows for the step the user is actually on.
    effect(() => {
      this.ctrl()?.step();
      untracked(() => this.showErrorsNow.set(false));
    });
  }

  ngOnInit(): void {
    this.ctrl.set(
      new FormadStepperController(this.stepper(), this.injector, (result) =>
        this.finished.emit(result),
      ),
    );
  }

  protected next(): void {
    // The gate lives in the controller, but the showcase is the summary: if the
    // step is invalid, reveal every error rather than silently doing nothing.
    if (!this.canNext()) {
      this.markAllTouched();
      this.showErrorsNow.set(true);
      return;
    }
    this.ctrl()?.next();
  }

  protected skip(): void {
    this.ctrl()?.skip();
  }

  protected back(): void {
    const c = this.ctrl();
    if (c && c.canBack()) c.back();
    else this.exited.emit();
  }

  private markAllTouched(): void {
    const step = this.current();
    if (!step) return;
    for (const form of step.forms) {
      const root = form.state.rootForm as unknown as Record<string, FieldTree<unknown>>;
      for (const field of form.state.fields) resolveLeaf(root, field.path).markAsTouched();
    }
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
