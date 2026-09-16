import { Binding } from '@angular/core';

/**
 * A page component's bindings, as `createComponent` takes them: the array itself, or a callback over the step context,
 * read when the component is mounted - so a component on a static step binds to what earlier steps hold.
 */
export type ComponentBindings<TCtx = unknown> =
  | readonly Binding[]
  | ((ctx: TCtx) => readonly Binding[]);

/** A page component's bindings, its visibility and layout class. */
export interface ComponentCfg<TCtx = unknown> {
  readonly bindings?: ComponentBindings<TCtx>;

  readonly visibleWhen?: (ctx: TCtx) => boolean;

  readonly layout?: string;
}
