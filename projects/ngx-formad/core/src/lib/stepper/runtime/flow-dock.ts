import { Directive, inject, Injectable } from '@angular/core';
import { StepperController } from '../types/controller';

/** The dock's three abilities: reopen the ring, amend what it has collected, or move the flow on. */
export abstract class FlowDock<C = unknown> {
  abstract restart(): void;

  abstract amend(update: (state: C) => C): void;

  abstract next(): void;
}

/** The shell's dock, addressing the innermost ring standing on its dock. */
@Injectable()
export class StepperFlowDock<C = unknown> extends FlowDock<C> {
  private controller: StepperController | null = null;

  _init(controller: StepperController): void {
    this.controller = controller;
  }

  override restart(): void {
    this.controller?.dockRestart();
  }

  override amend(update: (state: C) => C): void {
    this.controller?.dockAmend(update as (state: unknown) => unknown);
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
