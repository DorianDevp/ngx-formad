import { computed, Injectable, signal, Signal } from '@angular/core';
import { SharedState } from '../../shared';
import { StepperController } from '../types/controller';
import { RuntimeStepperContext } from '../types/step-context';

/** The wizard's collected data, injectable from any step slot or control rendered inside `<ngx-formad-stepper>`. */
@Injectable()
export class FormadWizard {
  private readonly _controller = signal<StepperController | null>(null);

  private _shared: SharedState | null = null;

  readonly controller: Signal<StepperController | null> = this._controller.asReadonly();

  readonly committed = computed<RuntimeStepperContext['steps']>(() => this._controller()?.committed() ?? {});

  get shared(): SharedState {
    if (!this._shared) throw new Error('FormadWizard is not initialized yet.');

    return this._shared;
  }

  sharedOrNull(): SharedState | null {
    return this._shared;
  }

  _init(controller: StepperController, shared: SharedState): void {
    this._shared = shared;
    this._controller.set(controller);
  }
}
