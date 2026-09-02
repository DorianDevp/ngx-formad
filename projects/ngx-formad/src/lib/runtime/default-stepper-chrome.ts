import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DeferTrigger } from '../builders/step-context';
import { StepPageView } from './step-page-view';
import {
  ProgressLevel,
  ProgressLevelKind,
  ProgressStep,
  ProgressStepState,
  StepperController,
} from './stepper-controller';

interface NestingDock {
  readonly label: string;
  readonly active: boolean;
  readonly reachable: boolean;
  readonly folds: number;
}

interface NestingRow {
  readonly steps: readonly ProgressStep[];
  readonly dock: NestingDock | null;
}

function toNestingRow(level: ProgressLevel): NestingRow {
  if (level.kind === ProgressLevelKind.Linear) return { steps: level.steps, dock: null };

  return {
    steps: level.pass?.steps ?? [],
    dock: {
      label: level.dock.label || 'Collected',
      active: level.dock.active,
      reachable: level.dock.reachable,
      folds: level.folds,
    },
  };
}

/** The bundled chrome around the headless controller: rail, nesting disclosure, heading, deferred body and nav. */
@Component({
  selector: 'ngx-formad-default-chrome',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StepPageView],
  template: `
    @let c = controller();
    @if (c.total() > 1 && hasAnyLabel()) {
      <ol class="ngx-formad-rail">
        @for (label of c.labels(); track $index) {
          <li
            class="ngx-formad-rail-step"
            [class.ngx-formad-current]="$index === c.index()"
            [attr.aria-current]="$index === c.index() ? 'step' : null"
          >
            {{ label || 'Step ' + ($index + 1) }}
          </li>
        }
      </ol>
    }
    @if (nested().length) {
      <button
        type="button"
        class="ngx-formad-nesting-toggle"
        [attr.aria-expanded]="nestingOpen()"
        aria-controls="ngx-formad-nesting"
        (click)="toggleNesting()"
      >
        <span class="ngx-formad-nesting-arrow" [class.ngx-formad-open]="nestingOpen()" aria-hidden="true">›</span>
        {{ c.label() || c.heading() }}
      </button>
      @if (nestingOpen()) {
        <div id="ngx-formad-nesting" class="ngx-formad-nesting">
          @for (row of nestingRows(); track $index) {
            <div class="ngx-formad-nesting-level" [class.ngx-formad-ring]="row.dock !== null">
              @if (row.steps.length) {
                <ol class="ngx-formad-nesting-steps">
                  @for (step of row.steps; track $index) {
                    <li
                      class="ngx-formad-nesting-step"
                      [class.ngx-formad-done]="step.state === doneState"
                      [class.ngx-formad-current]="step.state === activeState"
                      [attr.aria-current]="step.state === activeState ? 'step' : null"
                    >
                      {{ step.label || 'Step ' + ($index + 1) }}
                    </li>
                  }
                </ol>
              }
              @if (row.dock; as dock) {
                <span
                  class="ngx-formad-dock"
                  [class.ngx-formad-current]="dock.active"
                  [attr.aria-current]="dock.active ? 'step' : null"
                  [attr.aria-disabled]="!dock.reachable"
                >
                  {{ dock.label }} ({{ dock.folds }})
                </span>
              }
            </div>
          }
        </div>
      }
    }
    <p class="ngx-formad-visually-hidden" role="status" aria-live="polite">{{ foldsNote() }}</p>
    @if (c.loading()) {
      <div class="ngx-formad-loading"></div>
    } @else if (c.step(); as step) {
      <section #region tabindex="-1" class="ngx-formad-step">
        @if (c.heading()) {
          <h2 class="ngx-formad-heading">{{ c.heading() }}</h2>
        }
        @if (c.subheading()) {
          <p class="ngx-formad-subheading">{{ c.subheading() }}</p>
        }
        @switch (c.deferTrigger()) {
          @case (triggers.Viewport) {
            @defer (on viewport) {
              <ngx-formad-step-page [step]="step" />
            } @placeholder {
              <div class="ngx-formad-defer"></div>
            }
          }
          @case (triggers.Interaction) {
            @defer (on interaction) {
              <ngx-formad-step-page [step]="step" />
            } @placeholder {
              <div class="ngx-formad-defer"></div>
            }
          }
          @case (triggers.Idle) {
            @defer (on idle) {
              <ngx-formad-step-page [step]="step" />
            } @placeholder {
              <div class="ngx-formad-defer"></div>
            }
          }
          @default {
            <ngx-formad-step-page [step]="step" />
          }
        }
      </section>
    }
    @if (c.nextBlocked() && c.blockers().length) {
      <div class="ngx-formad-blockers" role="alert">
        <ul>
          @for (issue of c.blockers(); track $index) {
            <li><strong>{{ issue.label }}</strong>: {{ issue.message }}</li>
          }
        </ul>
      </div>
    }
    <nav class="ngx-formad-nav">
      <button type="button" [disabled]="!c.canBack()" (click)="c.back()">Back</button>
      @if (c.optional()) {
        <button type="button" (click)="c.skip()">Skip</button>
      }
      <button
        type="button"
        class="ngx-formad-next"
        [class.ngx-formad-blocked]="!c.canNext()"
        [attr.aria-disabled]="!c.canNext()"
        (click)="c.next()"
      >
        {{ c.isLast() ? 'Finish' : 'Next' }}
      </button>
    </nav>
  `,
})
export class DefaultStepperChrome {
  readonly controller = input.required<StepperController>();

  readonly doneState = ProgressStepState.Done;

  readonly activeState = ProgressStepState.Active;

  readonly triggers = DeferTrigger;

  readonly nestingOpen = signal(false);

  private readonly region = viewChild<ElementRef<HTMLElement>>('region');

  readonly hasAnyLabel = computed(() => this.controller().labels().some((label) => label.length > 0));

  readonly nested = computed<readonly ProgressLevel[]>(() => this.controller().progress().levels.slice(1));

  readonly nestingRows = computed<readonly NestingRow[]>(() => this.nested().map((level) => toNestingRow(level)));

  readonly foldsNote = computed(() => {
    const rings = this.controller()
      .progress()
      .levels.filter((level) => level.kind === ProgressLevelKind.Recurrent);
    if (!rings.length) return '';

    return rings.map((ring) => `${ring.dock.label || 'Collected'}: ${ring.folds}`).join('. ');
  });

  constructor() {
    afterRenderEffect(() => {
      this.controller().step();
      this.region()?.nativeElement.focus({ preventScroll: true });
    });
  }

  toggleNesting(): void {
    this.nestingOpen.update((open) => !open);
  }
}
