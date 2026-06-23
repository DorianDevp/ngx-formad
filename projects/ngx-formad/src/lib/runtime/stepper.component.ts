import { NgComponentOutlet } from '@angular/common';
import {
  Component,
  computed,
  EnvironmentInjector,
  inject,
  input,
  OnInit,
  output,
  signal,
  Type,
} from '@angular/core';
import { RuntimeStepper } from '../builders/stepper-builder';
import { STEPPER_ADAPTER } from '../provide';
import { DefaultStepperChrome } from './default-stepper-chrome';
import { FormadStepperController, StepperController } from './stepper-controller';

// The public stepper entry point. It is a thin wrapper: it builds the headless
// `StepperController` from the input wizard once, then renders the configured
// chrome (the third adapter axis) around it. With no `stepper` adapter provided it
// falls back to `DefaultStepperChrome`, so this works out of the box. All
// orchestration — laziness, conditions, the always-smooth deferred build — lives
// in the controller; this component only wires it to a chrome.
@Component({
  selector: 'ngx-formad-stepper',
  imports: [NgComponentOutlet],
  template: `
    @if (chromeInputs(); as inputs) {
      <ng-container *ngComponentOutlet="chrome; inputs: inputs" />
    }
  `,
})
export class StepperComponent implements OnInit {
  /** The built wizard, widened with `asStepper(...)`. */
  readonly stepper = input.required<RuntimeStepper>();
  /** Emitted when the user finishes the last step, carrying a forked result (if
   *  any). Erased to `unknown` here — cast to the wizard's result union, or read
   *  the typed `controller.result()` from a custom chrome. */
  readonly completed = output<unknown>();

  private readonly injector = inject(EnvironmentInjector);
  // The chrome component to render: the configured adapter, or the bundled default.
  protected readonly chrome: Type<unknown> = inject(STEPPER_ADAPTER, { optional: true }) ?? DefaultStepperChrome;
  private readonly controller = signal<StepperController | null>(null);
  protected readonly chromeInputs = computed(() => {
    const controller = this.controller();
    return controller ? { controller } : null;
  });

  ngOnInit(): void {
    // The input is available by ngOnInit; the controller defers its first build to
    // afterNextRender, so constructing it here does no heavy work.
    this.controller.set(
      new FormadStepperController(this.stepper(), this.injector, (result) =>
        this.completed.emit(result),
      ),
    );
  }
}
