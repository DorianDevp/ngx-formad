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
import { StepPageView } from './step-page-view';
import {
  ProgressLevel,
  ProgressLevelKind,
  ProgressStep,
  ProgressStepState,
  StepperController,
} from './stepper-controller';

// The bundled chrome — the default look around the headless controller. It reads
// the controller's signals and calls its actions; it owns the view concerns only:
// the progress rail (the steps' labels), the nesting disclosure (the deeper
// `progress()` levels, collapsed by default), the page's heading, the step body
// (deferred per the step's `defer` hint), a loading placeholder, and the Back /
// Skip / Next-or-Finish nav. Swap it through `provideFormadSuite({ stepper })`; a
// custom chrome is the same shape - one `controller` input.
@Component({
  selector: 'ngx-formad-default-chrome',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StepPageView],
  template: `
    @let c = controller();
    <!-- The rail is the ROOT level's labels: a nested flow occupies one entry, so
         the count never jumps while a sub-flow runs. A flow that labels nothing
         gets no rail; within a labelled flow a step that skipped its own label
         falls back to its position. -->
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
    <!-- The nesting disclosure: dynamic steppers are hostile to screen readers
         when steps appear and vanish silently, so the deeper levels are a real,
         inspectable structure — collapsed by default, announced when asked for. -->
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
            <!-- A linear level is a list; a ring is a pass bar with the dock as a
                 distinct point after it — reachable without walking the bar. -->
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
                  {{ dock.label }} ({{ dock.collected }})
                </span>
              }
            </div>
          }
        </div>
      }
    }
    <!-- Folds and pass changes happen without any DOM the reader was standing on,
         so the collected count is announced politely as it changes. -->
    <p class="ngx-formad-visually-hidden" role="status" aria-live="polite">{{ collectedNote() }}</p>
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
          @case ('viewport') {
            @defer (on viewport) {
              <ngx-formad-step-page [step]="step" />
            } @placeholder {
              <div class="ngx-formad-defer"></div>
            }
          }
          @case ('interaction') {
            @defer (on interaction) {
              <ngx-formad-step-page [step]="step" />
            } @placeholder {
              <div class="ngx-formad-defer"></div>
            }
          }
          @case ('idle') {
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
      <!-- Never \`disabled\`: a dead button is exactly the stuck-user trap — it can't
           be clicked, so it can't explain itself. A blocked Next stays clickable;
           the controller answers with the blocker list instead of advancing. -->
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

  protected readonly doneState = ProgressStepState.Done;

  protected readonly activeState = ProgressStepState.Active;

  protected readonly nestingOpen = signal(false);

  private readonly region = viewChild<ElementRef<HTMLElement>>('region');

  protected readonly hasAnyLabel = computed(() =>
    this.controller()
      .labels()
      .some((label) => label.length > 0),
  );

  /** The levels below the root — what the disclosure renders. */
  protected readonly nested = computed<readonly ProgressLevel[]>(() =>
    this.controller().progress().levels.slice(1),
  );

  // The levels flattened into one presentational shape, so the template stays a
  // dumb walk: a linear level is its steps; a ring is its pass bar plus the dock.
  protected readonly nestingRows = computed<readonly NestingRow[]>(() =>
    this.nested().map((level) => toNestingRow(level)),
  );

  // The polite announcement for the live region: it changes exactly when a fold
  // lands or a pass opens, which is when a screen reader needs to hear it.
  protected readonly collectedNote = computed(() => {
    const rings = this.controller()
      .progress()
      .levels.filter((level) => level.kind === ProgressLevelKind.Recurrent);
    if (!rings.length) return '';

    return rings
      .map((ring) => `${ring.dock.label || 'Collected'}: ${ring.collected}`)
      .join('. ');
  });

  constructor() {
    // Move focus to the new step's region when it changes, so keyboard and screen
    // reader users land on the step rather than being stranded on the old nav.
    // A genuine after-render DOM concern — the one place an effect belongs.
    afterRenderEffect(() => {
      this.controller().step();
      this.region()?.nativeElement.focus({ preventScroll: true });
    });
  }

  protected toggleNesting(): void {
    this.nestingOpen.update((open) => !open);
  }
}

interface NestingDock {
  readonly label: string;

  readonly active: boolean;

  readonly reachable: boolean;

  readonly collected: number;
}

interface NestingRow {
  readonly steps: readonly ProgressStep[];

  readonly dock: NestingDock | null;
}

function toNestingRow(level: ProgressLevel): NestingRow {
  if (level.kind === ProgressLevelKind.Linear) {
    return { steps: level.steps, dock: null };
  }

  return {
    steps: level.pass?.steps ?? [],
    dock: {
      label: level.dock.label || 'Collected',
      active: level.dock.active,
      reachable: level.dock.reachable,
      collected: level.collected,
    },
  };
}
