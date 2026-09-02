import { computed, Injectable, signal, Signal } from '@angular/core';
import { ErasedRecord } from '../builders/step-context';
import { SharedState } from '../sync/shared-state';
import { StepperController } from './stepper-controller';

/** The wizard's collected data, injectable from any step slot or control rendered inside `<ngx-formad-stepper>`. */
@Injectable()
export class FormadWizard {
  private readonly _controller = signal<StepperController | null>(null);

  private _shared: SharedState<ErasedRecord> | null = null;

  readonly controller: Signal<StepperController | null> = this._controller.asReadonly();

  readonly committed = computed<ErasedRecord>(() => this._controller()?.committed() ?? {});

  get shared(): SharedState<ErasedRecord> {
    if (!this._shared) throw new Error('FormadWizard is not initialized yet.');

    return this._shared;
  }

  sharedOrNull(): SharedState<ErasedRecord> | null {
    return this._shared;
  }

  _init(controller: StepperController, shared: SharedState<ErasedRecord>): void {
    this._shared = shared;
    this._controller.set(controller);
  }
}
