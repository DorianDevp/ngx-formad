import { Component, effect, ElementRef, input, viewChild } from '@angular/core';
import { StepPageView } from './step-page-view';
import { StepperController } from './stepper-controller';

// The bundled chrome — the default look around the headless controller. It reads
// the controller's signals and calls its actions; it owns the view concerns only:
// the progress rail (the steps' labels), the page's heading, the step body
// (deferred per the step's `defer` hint), a loading placeholder, and the Back /
// Skip / Next-or-Finish nav. Swap it through `provideFormadSuite({ stepper })`; a
// custom chrome is the same shape - one `controller` input.
@Component({
  selector: 'ngx-formad-default-chrome',
  imports: [StepPageView],
  template: `
    @let c = controller();
    <!-- The rail is the steps' labels, straight off the controller: derived from
         the effective sequence, so a gated step drops out of the rail and the count
         at the same moment. A flow that labels nothing gets no rail - a list reading
         "Step 1, Step 2" is chrome nobody asked for; within a labelled flow a step
         that skipped its own label falls back to its position. -->
    @if (c.total() > 1 && c.labels().some(hasText)) {
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
    @if (c.loading()) {
      <div class="ngx-formad-loading"></div>
    } @else if (c.step(); as step) {
      <section #region tabindex="-1" class="ngx-formad-step">
        <!-- A page's heading and subheading were data nobody drew; the chrome is
             where they belong, so the same authored page reads out of the box. -->
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
  protected readonly hasText = (label: string): boolean => label.length > 0;
  private readonly region = viewChild<ElementRef<HTMLElement>>('region');

  constructor() {
    // Move focus to the new step's region when it changes, so keyboard and screen
    // reader users land on the step rather than being stranded on the old nav.
    // The microtask defers to after the DOM swaps the section in.
    effect(() => {
      this.controller().step();
      queueMicrotask(() => this.region()?.nativeElement.focus({ preventScroll: true }));
    });
  }
}
