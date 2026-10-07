import { Provider } from '@angular/core';
import { ControlTypeMap } from '../../controls';
import { StateSeeds } from '../../shared';
import { FlowDefinition, SequenceNode } from './flow';
import { AnyFormProvider } from './step-context';

/** What a chain accumulates while it is authored: its pool, its shared seeds, its sequence, its control kinds and providers. */
export interface ChainState {
  readonly forms: Readonly<Record<string, AnyFormProvider>>;

  readonly sharedSeeds: StateSeeds<Record<string, unknown>>;

  readonly steps: readonly SequenceNode[];

  readonly controlTypes: ControlTypeMap;

  readonly providers: readonly Provider[];

  readonly stepNames: Readonly<Record<string, true>>;
}

/** One authored arm of a `branch` or a `fork`: the key its selector names it by, and what it built. */
export interface Arm {
  readonly key: string;

  readonly flow: FlowDefinition;
}
