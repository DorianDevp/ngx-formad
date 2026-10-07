import { NgComponentOutlet } from '@angular/common';
import {
  Component,
  computed,
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
import { FlowDock, StepperFlowDock } from '../runtime/flow-dock';
import { FormadStepperController } from '../runtime/stepper-controller';
import { FormadWizard } from '../runtime/wizard-context';
import { StepsCommitted } from '../types/builder';
import { StepperController } from '../types/controller';
import { BuiltFlow } from '../types/flow';
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
export class StepperComponent<TResult = unknown, TCtx extends RuntimeStepperContext = RuntimeStepperContext>
  implements OnInit, OnDestroy
{
  /** A built stepper: `build()` instantiated its forms, the shell draws them. */
  readonly stepper = input.required<BuiltFlow<unknown, TCtx, TResult>>();

  readonly completed = output<TResult | null>();

  readonly stepCommitted = output<StepsCommitted<TCtx['steps']>>();

  private readonly injector = inject(Injector);
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
    const stepper = this.stepper();
    this.controlScope.map = stepper.instance.flow.controlTypes;
    const controller = new FormadStepperController(stepper.instance, {
      environment: stepper.instance.environment,
      injector: this.injector,
      onComplete: (result) => this.completed.emit(result),
      // The controller runs the erased flow; `TCtx` is the one it was built from.
      onStep: (values) => this.stepCommitted.emit(values as StepsCommitted<TCtx['steps']>),
    });
    stepper.instance.environment.get(FormadWizard)._init(controller);
    this.flowDock._init(controller);
    this.controller.set(controller);
  }

  ngOnDestroy(): void {
    this.controller()?.destroy();
  }
}
