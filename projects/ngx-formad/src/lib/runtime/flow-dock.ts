import { Directive, inject, Injectable } from '@angular/core';
import { StepperController } from './stepper-controller';

// The dock's contract, and nothing more: a dock can do exactly two things —
// reopen the ring (a fresh pass from the start of the process), and move the
// wizard on to the next step of the instance above. A component becomes a dock
// either by injecting `FlowDock` (the class route), or by marking its buttons
// with the attribute directives below (the template route, MatDialog-style) —
// in both cases it stays dumb: no controller, no goTo, no shared state.

export abstract class FlowDock {
  /** Reopen the ring: a fresh pass with fresh forms; the collection is kept. */
  abstract restart(): void;
  /** Complete the flow: the instance above advances past it. Gated — the flow's
   *  `completeWhen` still holds it back with its own message. */
  abstract next(): void;
}

/** The shell's implementation — addresses the innermost recurrent flow currently
 *  standing on its dock, through the root controller facade. @internal */
@Injectable()
export class StepperFlowDock extends FlowDock {
  private controller: StepperController | null = null;

  /** @internal wired once by the stepper shell. */
  _init(controller: StepperController): void {
    this.controller = controller;
  }

  override restart(): void {
    this.controller?.dockRestart();
  }

  override next(): void {
    this.controller?.next();
  }
}

/** Marks a button as the dock's "add another" — reopens the ring on click. */
@Directive({
  selector: '[ngxFormadDockRestart]',
  host: { '(click)': 'dock.restart()' },
})
export class FormadDockRestart {
  protected readonly dock = inject(FlowDock);
}

/** Marks a button as the dock's "move on" — completes the flow on click. */
@Directive({
  selector: '[ngxFormadDockNext]',
  host: { '(click)': 'dock.next()' },
})
export class FormadDockNext {
  protected readonly dock = inject(FlowDock);
}
