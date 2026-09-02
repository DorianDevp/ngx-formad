import { Directive, inject, Injectable } from '@angular/core';
import { StepperController } from './stepper-controller';

/** The dock's two abilities: reopen the ring, or move the flow on. */
export abstract class FlowDock {
  abstract restart(): void;

  abstract next(): void;
}

/** The shell's dock, addressing the innermost ring standing on its dock. */
@Injectable()
export class StepperFlowDock extends FlowDock {
  private controller: StepperController | null = null;

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

/** Marks a button as the dock's "add another": reopens the ring on click. */
@Directive({
  selector: '[ngxFormadDockRestart]',
  host: { '(click)': 'dock.restart()' },
})
export class FormadDockRestart {
  readonly dock = inject(FlowDock);
}

/** Marks a button as the dock's "move on": completes the flow on click. */
@Directive({
  selector: '[ngxFormadDockNext]',
  host: { '(click)': 'dock.next()' },
})
export class FormadDockNext {
  readonly dock = inject(FlowDock);
}
