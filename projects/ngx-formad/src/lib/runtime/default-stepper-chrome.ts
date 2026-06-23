import { Component, input } from '@angular/core';
import { StepFormsView } from './step-forms-view';
import { StepperController } from './stepper-controller';

// The bundled chrome — the default look around the headless controller. It reads
// the controller's signals and calls its actions; it owns the view concerns only:
// the step body (deferred per the step's `defer` hint), a loading placeholder, and
// the Back / Skip / Next-or-Finish nav. Swap it through `provideFormadSuite({
// stepper })`; a custom chrome is the same shape — one `controller` input.
@Component({
  selector: 'ngx-formad-default-chrome',
  imports: [StepFormsView],
  template: `
    @let c = controller();
    @if (c.loading()) {
      <div class="ngx-formad-loading"></div>
    } @else if (c.step(); as step) {
      <section class="ngx-formad-step">
        @switch (c.deferTrigger()) {
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
      <button type="button" [disabled]="!c.canBack()" (click)="c.back()">Back</button>
      @if (c.optional()) {
        <button type="button" (click)="c.skip()">Skip</button>
      }
      <button type="button" [disabled]="!c.canNext()" (click)="c.next()">
        {{ c.isLast() ? 'Finish' : 'Next' }}
      </button>
    </nav>
  `,
})
export class DefaultStepperChrome {
  readonly controller = input.required<StepperController>();
}
