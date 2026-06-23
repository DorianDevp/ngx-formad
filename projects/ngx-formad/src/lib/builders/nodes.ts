import { Binding, Type } from '@angular/core';
import { LinkPair } from './shared-link';

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
}
