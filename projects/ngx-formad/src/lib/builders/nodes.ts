import { Binding, Type } from '@angular/core';
import { LinkPair } from './shared-link';
import { DeferTrigger, RuntimeStepCondition } from './step-context';

// The builder runs once and emits this plain tree; the renderer walks it. Every
// node is data — a "show this when" is a `visibleWhen` getter, never an `if` in
// the chain — so the same config can drive rendering, completion, and (later) a
// JSON front-end without the builder being in the loop.

/** A bare layout slot, e.g. a spacer or a full-width gap. */
export interface ContentNode {
  readonly kind: 'content';
  readonly layout?: string;
}

/** A dynamic component with its pre-normalized bindings and visibility. */
export interface ComponentNode {
  readonly kind: 'component';
  readonly component: Type<unknown>;
  readonly bindings: Binding[];
  readonly visibleWhen?: () => boolean;
  readonly layout?: string;
}

/** A form drawn from the pool by name, with its shared-state links. */
export interface FormNode {
  readonly kind: 'form';
  readonly name: string;
  readonly submitLabel?: string;
  readonly visibleWhen?: () => boolean;
  readonly links: readonly LinkPair[];
}

/** A nested layout group. */
export interface RowNode {
  readonly kind: 'row';
  readonly layout: string;
  readonly children: readonly LayoutNode[];
}

/** Anything that can sit in a page. */
export type LayoutNode = ContentNode | ComponentNode | FormNode | RowNode;

/** Page chrome. */
export interface PageOptions {
  readonly heading?: string;
  /** A short line under the heading; purely presentational, read by the shell. */
  readonly subheading?: string;
  readonly layout?: string;
}

/** A page: chrome plus the nodes it lays out. */
export interface PageNode {
  readonly options: PageOptions;
  readonly children: readonly LayoutNode[];
}

/** A step: one or more pages. Completion folds over the forms across them. */
export interface StepNode {
  readonly pages: readonly PageNode[];
  /** When present and false, the step is dropped from the effective sequence.
   *  Evaluated reactively against the live shared state and committed values. */
  readonly when?: RuntimeStepCondition;
  /** A skippable step: the shell offers a Skip that bypasses the completion gate. */
  readonly optional?: boolean;
  /** Render this step's body inside an `@defer` block with the given trigger. */
  readonly defer?: DeferTrigger;
}
