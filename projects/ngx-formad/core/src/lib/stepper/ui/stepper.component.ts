import { NgComponentOutlet } from '@angular/common';
import {
  Component,
  computed,
  EnvironmentInjector,
  inject,
  Injectable,
  InjectionToken,
  Injector,
  input,
  OnDestroy,
  OnInit,
  output,
  signal,
  SkipSelf,
  Type,
} from '@angular/core';
import { CONTROL_ADAPTER, ControlAdapter, ControlTypeMap } from '../../controls';
import { SHARED_STATE } from '../../shared';
import { FlowDock, StepperFlowDock } from '../runtime/flow-dock';
import { FormadStepperController } from '../runtime/stepper-controller';
import { FormadWizard } from '../runtime/wizard-context';
import { StepperController } from '../types/controller';
import { RuntimeFlow } from '../types/flow';
import { RuntimeStepperContext } from '../types/step-context';

/** The active stepper chrome; `null` means none is provided, and the stepper refuses to render without one. */
export const STEPPER_ADAPTER = new InjectionToken<Type<object> | null>('ngx-formad.stepper', {
  providedIn: 'root',
  factory: () => null,
});

@Injectable()
class StepperControlScope {
  map: ControlTypeMap = {};
}

/** The stepper shell: builds the headless controller for a flow and renders the configured chrome around it. */
@Component({
  selector: 'ngx-formad-stepper',
  imports: [NgComponentOutlet],
  providers: [
    FormadWizard,
    StepperControlScope,
    StepperFlowDock,
    { provide: FlowDock, useExisting: StepperFlowDock },
    { provide: SHARED_STATE, useFactory: (wizard: FormadWizard) => wizard.sharedOrNull(), deps: [FormadWizard] },
    {
      provide: CONTROL_ADAPTER,
      useFactory: (scope: StepperControlScope, parent: ControlAdapter): ControlAdapter => ({
        controlFor: (kind) => scope.map[kind] ?? parent.controlFor(kind),
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
export class StepperComponent<TResult = unknown> implements OnInit, OnDestroy {
  readonly stepper = input.required<RuntimeFlow<TResult>>();

  readonly completed = output<TResult | null>();

  readonly stepCommitted = output<RuntimeStepperContext['steps']>();

  private readonly parentEnvironment = inject(EnvironmentInjector);
  private readonly injector = inject(Injector);
  private readonly wizard = inject(FormadWizard);
  private readonly controlScope = inject(StepperControlScope);
  private readonly flowDock = inject(StepperFlowDock);
  readonly chrome: Type<object>;
  private readonly controller = signal<StepperController | null>(null);
  readonly chromeInputs = computed(() => {
    const controller = this.controller();
    return controller ? { controller } : null;
  });

  constructor() {
    const chrome = inject(STEPPER_ADAPTER, { optional: true });
    if (!chrome) {
      throw new Error(
        "ngx-formad: no stepper chrome is provided; provideFormadSuite({ stepper: DefaultStepperChrome }) from 'ngx-formad/chrome', or a chrome of your own.",
      );
    }
    this.chrome = chrome;
  }

  ngOnInit(): void {
    this.controlScope.map = this.stepper().controlTypes;
    const controller = new FormadStepperController(this.stepper(), {
      environment: this.parentEnvironment,
      injector: this.injector,
      onComplete: (result) => this.completed.emit(result),
      onStep: (values) => this.stepCommitted.emit(values),
    });
    this.wizard._init(controller, this.stepper().shared);
    this.flowDock._init(controller);
    this.controller.set(controller);
  }

  ngOnDestroy(): void {
    this.controller()?.destroy();
  }
}
