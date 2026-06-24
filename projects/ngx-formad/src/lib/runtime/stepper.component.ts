import { NgComponentOutlet } from '@angular/common';
import {
  Component,
  computed,
  EnvironmentInjector,
  inject,
  Injectable,
  input,
  OnInit,
  output,
  signal,
  SkipSelf,
  Type,
} from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { SharedState } from '../sync/shared-state';
import { RuntimeStepper } from '../builders/stepper-builder';
import { ControlAdapter } from '../controls/control-adapter';
import { CONTROL_ADAPTER, ControlTypeMap, STEPPER_ADAPTER } from '../provide';
import { DefaultStepperChrome } from './default-stepper-chrome';
import { FormadStepperController, StepperController } from './stepper-controller';
import { FormadWizard } from './wizard-context';

// Holds the active stepper's wizard-scoped control kinds, populated in `ngOnInit`.
// The merged `CONTROL_ADAPTER` below reads it at resolve time (after init), so the
// chrome and every slot/form in the subtree see these kinds layered over the global.
@Injectable()
class StepperControlScope {
  map: ControlTypeMap = {};
}

// The public stepper entry point. It is a thin wrapper: it builds the headless
// `StepperController` from the input wizard once, then renders the configured
// chrome (the third adapter axis) around it. With no `stepper` adapter provided it
// falls back to `DefaultStepperChrome`, so this works out of the box. All
// orchestration — laziness, conditions, the always-smooth deferred build — lives
// in the controller; this component only wires it to a chrome.
@Component({
  selector: 'ngx-formad-stepper',
  imports: [NgComponentOutlet],
  // One wizard context per stepper, inherited by the chrome and every slot it
  // renders — so a summary or custom control can `inject(FormadWizard)`. The merged
  // control adapter layers this stepper's `addControlType`/`overrideControlType`
  // kinds over the inherited global adapter, for this subtree only.
  providers: [
    FormadWizard,
    StepperControlScope,
    {
      provide: CONTROL_ADAPTER,
      useFactory: (scope: StepperControlScope, parent: ControlAdapter): ControlAdapter => ({
        controlFor: (kind) =>
          (scope.map[kind] as Type<FormValueControl<unknown>> | undefined) ?? parent.controlFor(kind),
      }),
      deps: [StepperControlScope, [new SkipSelf(), CONTROL_ADAPTER]],
    },
  ],
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
  /** Emitted after each commit (Next / Back / Skip) with every form's last-committed
   *  model, keyed by pool name — the egress for persisting a step's values before
   *  the wizard finishes. The same data is on `controller.committed()`. */
  readonly stepCommitted = output<Record<string, Record<string, unknown>>>();

  private readonly injector = inject(EnvironmentInjector);
  private readonly wizard = inject(FormadWizard);
  private readonly controlScope = inject(StepperControlScope);
  // The chrome component to render: the configured adapter, or the bundled default.
  protected readonly chrome: Type<unknown> = inject(STEPPER_ADAPTER, { optional: true }) ?? DefaultStepperChrome;
  private readonly controller = signal<StepperController | null>(null);
  protected readonly chromeInputs = computed(() => {
    const controller = this.controller();
    return controller ? { controller } : null;
  });

  ngOnInit(): void {
    // Publish this wizard's control kinds before the chrome/forms render and pull
    // the merged adapter.
    this.controlScope.map = this.stepper().controlTypes;
    // The input is available by ngOnInit; the controller defers its first build to
    // afterNextRender, so constructing it here does no heavy work.
    const controller = new FormadStepperController(
      this.stepper(),
      this.injector,
      (result) => this.completed.emit(result),
      (values) => this.stepCommitted.emit(values),
    );
    this.wizard._init(controller, this.stepper().shared as SharedState<Record<string, unknown>>);
    this.controller.set(controller);
  }
}
