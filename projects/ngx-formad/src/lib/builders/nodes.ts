import { Binding, Type } from '@angular/core';
import { Live } from '../form-config/live';
import { ContentChild } from './content';
import { LinkPair, OutputEffect } from './shared-link';
import { DeferTrigger, RuntimeStepContext } from './step-context';

/** Discriminates what a page lays out. */
export enum LayoutNodeKind {
  Content = 'content',
  Component = 'component',
  Form = 'form',
  Row = 'row',
}

/** A content block in a layout slot of its own; empty `children` is a bare spacer. */
export interface ContentNode {
  readonly kind: LayoutNodeKind.Content;

  readonly layout?: string;

  readonly visibleWhen?: () => boolean;

  readonly children: readonly ContentChild[];
}

/** A dynamic component with its pre-normalized bindings and visibility. */
export interface ComponentNode {
  readonly kind: LayoutNodeKind.Component;

  readonly component: Type<object>;

  readonly bindings: readonly Binding[];

  readonly visibleWhen?: () => boolean;

  readonly layout?: string;
}

/** A pooled form placed by name, with its shared links, output effects and local `initial` seed. */
export interface FormNode<M extends Record<string, unknown> = Record<string, unknown>> {
  readonly kind: LayoutNodeKind.Form;

  readonly name: string;

  readonly submitLabel?: string;

  readonly visibleWhen?: () => boolean;

  readonly links: readonly LinkPair[];

  readonly effects: readonly OutputEffect[];

  initial?(ctx: RuntimeStepContext): Partial<M>;
}

/** A nested layout row. */
export interface RowNode {
  readonly kind: LayoutNodeKind.Row;

  readonly layout: string;

  readonly children: readonly LayoutNode[];
}

/** Anything that can sit in a page. */
export type LayoutNode = ContentNode | ComponentNode | FormNode | RowNode;

/** A page's heading and subheading (both may follow a signal) and its layout class. */
export interface PageOptions {
  readonly heading?: Live<string>;

  readonly subheading?: Live<string>;

  readonly layout?: string;
}

/** A page: its options and the nodes it lays out. */
export interface PageNode {
  readonly options: PageOptions;

  readonly children: readonly LayoutNode[];
}

/** Discriminates a sequence member: a leaf step or a nested flow. */
export enum SequenceNodeKind {
  Step = 'step',
  Flow = 'flow',
}

/** Pages built on entry from the live context; the build must be pure. */
export interface DynamicPages {
  build(ctx: RuntimeStepContext): readonly PageNode[];
}

/** A leaf step: its pages (data, or built on entry), gate, label, defer hint and completion guard. */
export interface StepNode {
  readonly kind: SequenceNodeKind.Step;

  readonly name?: string;

  readonly pages: readonly PageNode[] | DynamicPages;

  readonly label?: Live<string>;

  when?(ctx: RuntimeStepContext): boolean;

  readonly optional?: boolean;

  readonly defer?: DeferTrigger;

  completeWhen?(ctx: RuntimeStepContext): boolean;

  readonly incompleteMessage?: string;
}
