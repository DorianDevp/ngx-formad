import { computed, Injectable, signal, Signal } from '@angular/core';
import { SharedState } from '../sync/shared-state';
import { StepperController } from './stepper-controller';

// The wizard's collected data, injectable from any step slot or custom control
// rendered inside `<ngx-formad-stepper>`. A summary screen reads `committed()`;
// a value-contributing widget (a product picker) reads/writes `shared` — neither
// needs the host to wire inputs. `StepperComponent` provides one instance for its
// subtree, so slots created within it inherit it through DI.
//
// Inject it `{ optional: true }`: it is null for a standalone `<ngx-formad-form>`
// that isn't inside a stepper.
@Injectable()
export class FormadWizard {
  private readonly _controller = signal<StepperController | null>(null);
  private _shared: SharedState<Record<string, unknown>> | null = null;

  /** The headless controller — `committed()`, `step()`, `index()`, `result()`, … */
  readonly controller: Signal<StepperController | null> = this._controller.asReadonly();

  /** Every form's last-committed model, keyed by pool name (reactive). */
  readonly committed = computed<Record<string, Record<string, unknown>>>(
    () => this._controller()?.committed() ?? {},
  );

  /** The cross-step shared store — `get` / `patch` / `select` / `snapshot`. */
  get shared(): SharedState<Record<string, unknown>> {
    if (!this._shared) throw new Error('FormadWizard is not initialized yet.');
    return this._shared;
  }

  /** @internal — wired once by the stepper shell. */
  _init(controller: StepperController, shared: SharedState<Record<string, unknown>>): void {
    this._shared = shared;
    this._controller.set(controller);
  }
}
