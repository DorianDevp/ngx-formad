import { Binding, Signal, Type } from '@angular/core';
import { ContentChild } from './content';
import { BindingRecord, FormEffectHook } from '../form-config/form-bindings';
import { LinkPair } from './shared-link';
import { DeferTrigger, RuntimeStepperContext } from './step-context';

/** Discriminates what a page lays out. */
export enum LayoutNodeKind {
  Content = 'content',
  Component = 'component',
  Form = 'form',
  Row = 'row',
}

/** A content block in a layout slot of its own. */
export interface ContentNode {
  readonly kind: LayoutNodeKind.Content;

  readonly layout?: string;

  visibleWhen?(ctx: RuntimeStepperContext): boolean;

  readonly children: readonly ContentChild[];
}

/** A dynamic component with its bindings over the step context and its visibility. */
export interface ComponentNode {
  readonly kind: LayoutNodeKind.Component;

  readonly component: Type<object>;

  /** A method, so a callback typed on a richer context fits; an authored array is wrapped in one. */
  bindings(ctx: RuntimeStepperContext): readonly Binding[];

  visibleWhen?(ctx: RuntimeStepperContext): boolean;

  readonly layout?: string;
}

/** What a placed form does with its `initial` seed when its step is entered again. */
export enum FormRevisit {
  /** The instance stays as the user left it; `initial` applied once, when the step came to life. */
  Keep = 'keep',
  /** `initial` is read again from the current context and goes into the fields the user has not edited. */
  Reseed = 'reseed',
}

/** A pooled form placed by name, with its shared links, bindings, effects, local `initial` seed and revisit policy. */
export interface FormNode<M extends Record<string, unknown> = Record<string, unknown>> {
  readonly kind: LayoutNodeKind.Form;

  readonly name: string;

  visibleWhen?(ctx: RuntimeStepperContext): boolean;

  readonly links: readonly LinkPair[];

  readonly bindings: BindingRecord;

  readonly effects: readonly FormEffectHook[];

  initial?(ctx: RuntimeStepperContext): Partial<M>;

  readonly revisit?: FormRevisit;
}

/** A nested layout row; its gate takes its children with it, completion included. */
export interface RowNode {
  readonly kind: LayoutNodeKind.Row;

  readonly layout?: string;

  visibleWhen?(ctx: RuntimeStepperContext): boolean;

  readonly children: readonly LayoutNode[];
}

/** Anything that can sit in a page. */
export type LayoutNode = ContentNode | ComponentNode | FormNode | RowNode;

/** A page's heading and subheading (both may follow a signal), its layout class and its own gate. */
export interface PageOptions {
  readonly heading?: Signal<string>;

  readonly subheading?: Signal<string>;

  readonly layout?: string;

  visibleWhen?(ctx: RuntimeStepperContext): boolean;
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
  build(ctx: RuntimeStepperContext): readonly PageNode[];
}

/** What a step does when navigation lands on it again. */
export enum StepRevisit {
  /** The step stays as it was: its pages, its forms and what the user typed. */
  Keep = 'keep',
  /** The step is dropped and built again from the current context, pages and forms alike. */
  Fresh = 'fresh',
}

/** A leaf step: its pages (data, or built on entry), gate, label, defer hint, completion guard and revisit policy. */
export interface StepNode {
  readonly kind: SequenceNodeKind.Step;

  readonly name?: string;

  readonly pages: readonly PageNode[] | DynamicPages;

  readonly label?: Signal<string>;

  when?(ctx: RuntimeStepperContext): boolean;

  readonly optional?: boolean;

  readonly defer?: DeferTrigger;

  completeWhen?(ctx: RuntimeStepperContext): boolean;

  readonly incompleteMessage?: string;

  readonly revisit?: StepRevisit;
}
