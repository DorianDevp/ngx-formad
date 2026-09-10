import { NgComponentOutlet } from '@angular/common';
import {
  Component,
  computed,
  EnvironmentInjector,
  inject,
  Injectable,
  Injector,
  input,
  OnDestroy,
  OnInit,
  output,
  signal,
  SkipSelf,
  Type,
} from '@angular/core';
import { RuntimeFlow } from '../builders/flow';
import { RuntimeStepperContext } from '../builders/step-context';
import { ControlAdapter } from '../controls/control-adapter';
import { CONTROL_ADAPTER, ControlTypeMap, STEPPER_ADAPTER } from '../provide';
import { DefaultStepperChrome } from './default-stepper-chrome';
import { FlowDock, StepperFlowDock } from './flow-dock';
import { FormadStepperController, StepperController } from './stepper-controller';
import { FormadWizard } from './wizard-context';

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
  readonly chrome: Type<object> = inject(STEPPER_ADAPTER, { optional: true }) ?? DefaultStepperChrome;
  private readonly controller = signal<StepperController | null>(null);
  readonly chromeInputs = computed(() => {
    const controller = this.controller();
    return controller ? { controller } : null;
  });

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
