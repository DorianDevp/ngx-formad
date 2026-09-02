import { Binding, Type } from '@angular/core';
import { ContentChild } from './content';
import { Reactive } from './dynamic-component';
import { LinkPair, OutputEffect } from './shared-link';
import {
  DeferTrigger,
  RuntimeFormSeed,
  RuntimeStepCondition,
  RuntimeStepContext,
} from './step-context';

// The builder runs once and emits this plain tree; the renderer walks it. Every
// node is data — a "show this when" is a `visibleWhen` getter, never an `if` in
// the chain — so the same config can drive rendering, completion, and (later) a
// JSON front-end without the builder being in the loop.

/** A content block: the markup authored through `addContent`'s tag builder, in a
 *  layout slot of its own. `children` empty is the bare slot this node used to be
 *  - a spacer or a full-width gap. */
export interface ContentNode {
  readonly kind: 'content';
  readonly layout?: string;
  readonly visibleWhen?: () => boolean;
  readonly children: readonly ContentChild[];
}

/** A dynamic component with its pre-normalized bindings and visibility. */
export interface ComponentNode {
  readonly kind: 'component';
  readonly component: Type<unknown>;
  readonly bindings: Binding[];
  readonly visibleWhen?: () => boolean;
  readonly layout?: string;
}

/** A form drawn from the pool by name, with its shared-state links and any
 *  control-output effects. */
export interface FormNode {
  readonly kind: 'form';
  readonly name: string;
  readonly submitLabel?: string;
  readonly visibleWhen?: () => boolean;
  readonly links: readonly LinkPair[];
  readonly effects: readonly OutputEffect[];
  /** Starting values for THIS instance, read from the entry context when the
   *  step materializes — the LOCAL channel from a predecessor's live instance
   *  into this form (`bind` is the global one, through shared state). */
  readonly initial?: RuntimeFormSeed;
}

/** A nested layout group. */
export interface RowNode {
  readonly kind: 'row';
  readonly layout: string;
  readonly children: readonly LayoutNode[];
}

/** Anything that can sit in a page. */
export type LayoutNode = ContentNode | ComponentNode | FormNode | RowNode;

/** Page chrome - the text a chrome draws around the page's nodes. Both lines are
 *  `Reactive`, because a step's own heading is often a function of what the user
 *  picked ("2 items in your basket"), and re-authoring the tree for that would be
 *  absurd. A chrome reads them as plain signals off the controller. */
export interface PageOptions {
  readonly heading?: Reactive<string>;
  /** A short line under the heading; purely presentational, read by the shell. */
  readonly subheading?: Reactive<string>;
  readonly layout?: string;
}

/** A page: chrome plus the nodes it lays out. */
export interface PageNode {
  readonly options: PageOptions;
  readonly children: readonly LayoutNode[];
}

/** Discriminates the members of a flow's sequence: a leaf step, or a nested
 *  flow occupying one slot — see `builders/flow.ts` for the union. */
export enum SequenceNodeKind {
  Step = 'step',
  Flow = 'flow',
}

/** A dynamic step's page factory: it runs when the step is reached, with the
 *  live condition context (a snapshot taken after the previous step committed),
 *  so the step's structure — which pooled forms it places, what prose and
 *  components it shows — can follow the user's earlier answers. It MUST be pure:
 *  the same context yields the same pages, since a re-entry may run it again.
 *  Authored by declaring the SECOND parameter on the step callback:
 *  `createStep((step, ctx) => ...)`. */
export type DynamicPages = (ctx: RuntimeStepContext) => readonly PageNode[];

/** A step: one or more pages — plain data built once, or a pure factory built on
 *  entry (see {@link DynamicPages}). Completion folds over the forms across them. */
export interface StepNode {
  readonly kind: SequenceNodeKind.Step;
  /** The key successors read this step's instances under (`ctx.steps.<name>`).
   *  Unnamed steps are reachable by their authored index only — fragile under
   *  reordering, so name any step another one reads. */
  readonly name?: string;
  readonly pages: readonly PageNode[] | DynamicPages;
  /** The step's short name, for a chrome's progress rail. It belongs on the step
   *  (not on a page's `heading`, which titles one page of possibly several) and it
   *  belongs *here* so the rail can be derived from the same effective sequence
   *  `index`/`total` come from - a list kept outside the stepper has to re-evaluate
   *  every `when` to know who is visible, and silently misaligns when it drifts. */
  readonly label?: Reactive<string>;
  /** When present and false, the step is dropped from the effective sequence.
   *  Evaluated reactively against the live shared state and committed values. */
  readonly when?: RuntimeStepCondition;
  /** A skippable step: the shell offers a Skip that bypasses the completion gate. */
  readonly optional?: boolean;
  /** Render this step's body inside an `@defer` block with the given trigger. */
  readonly defer?: DeferTrigger;
  /** An extra completion guard, ANDed with the form fold. A step whose body is
   *  driven by dynamic components (not forms) has no fields to fold, so it is
   *  vacuously complete; `completeWhen` lets such a step gate Next on its own
   *  state (a selection made, a consent given). Receives the same context as
   *  `when` — live shared state plus committed values. Evaluated reactively. */
  readonly completeWhen?: RuntimeStepCondition;
  /** Shown in the blocker list when `completeWhen` is what holds Next back — the
   *  guard is an opaque predicate, so without this the user sees only a generic
   *  "not complete yet" and can be left guessing. */
  readonly incompleteMessage?: string;
}
