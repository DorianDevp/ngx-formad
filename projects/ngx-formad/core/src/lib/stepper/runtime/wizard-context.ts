import { computed, signal, Signal } from '@angular/core';
import { SharedState, StateOf } from '../../shared';
import { CommittedOf, Egress } from '../types/builder';
import { StepperController } from '../types/controller';
import { RuntimeStepper } from '../types/flow';

/**
 * The wizard's collected data, injectable from anything a stepper draws - a page component, a formField of a step
 * form, a dock: the stepper's environment holds it. Typed by the built stepper,
 * `inject<FormadWizard<typeof checkout>>(FormadWizard)`; inside, `shared` is writable.
 */
export class FormadWizard<S extends RuntimeStepper = RuntimeStepper> {
  private readonly _controller = signal<StepperController<Egress<S>> | null>(null);

  /** The controller of the `<ngx-formad-stepper>` drawing the stepper; `null` until one does. */
  readonly controller: Signal<StepperController<Egress<S>> | null> = this._controller.asReadonly();

  /** Every committed model, by step and form name. */
  readonly committed: Signal<CommittedOf<S>>;

  /** The shared state, one writable signal per `withState` key: `wizard.shared.plan.set('pro')`. */
  readonly shared: SharedState<StateOf<NonNullable<S['__context']>['shared']>>;

  /** The named steps' forms, as the built stepper hands them out. */
  readonly steps: S['steps'];

  constructor(stepper: S) {
    // The flow is erased; `S` is what it was built from, and says which keys the store holds.
    this.shared = stepper.instance.sharedState as SharedState<StateOf<NonNullable<S['__context']>['shared']>>;
    this.steps = stepper.steps;
    this.committed = computed(() => (this._controller()?.committed() ?? {}) as CommittedOf<S>);
  }

  _init(controller: StepperController<Egress<S>>): void {
    this._controller.set(controller);
  }
}
