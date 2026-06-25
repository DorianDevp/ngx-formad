import { Component, computed, input } from '@angular/core';
import { ComponentNode, ContentNode, FormNode, LayoutNode, RowNode } from '../builders/nodes';
import { FormState } from '../renderer/instantiate-form';
import { ComponentOutlet } from '../renderer/component-outlet';
import { FormRenderer } from '../renderer/form-renderer';
import { LiveForm, LiveStep } from './materialize-step';

// Renders one live step's *whole* page tree — not just its forms. `StepFormsView`
// draws the flat form list (enough for a forms-only wizard); this draws everything
// a page can hold: forms in place, dynamic components, nested layout rows, and bare
// content slots, each gated by its own `visibleWhen`. A chrome that wants the
// authored layout (components beside forms, conditional blocks) renders this; the
// bundled chrome does. Forms are resolved back to their live `FormState` by name,
// off the `LiveStep` the controller materialized.

/** The recursive core: draws one level of a page's `LayoutNode[]`, descending into
 *  rows. Split from the step wrapper so a row can re-enter it (the `NodesView`
 *  pattern, one level up — pages instead of fields). */
@Component({
  selector: 'ngx-formad-page-nodes',
  imports: [FormRenderer, ComponentOutlet, PageNodesView],
  host: { style: 'display: contents' },
  template: `
    @for (node of nodes(); track $index) {
      @switch (node.kind) {
        @case ('form') {
          @if (visible(form(node))) {
            @if (liveFormFor(form(node).name); as live) {
              <ngx-formad-form [state]="live.state" [effects]="live.effects" />
            }
          }
        }
        @case ('component') {
          @if (visible(component(node))) {
            <ngx-formad-component-outlet [node]="component(node)" />
          }
        }
        @case ('row') {
          <div class="ngx-formad-row" [class]="row(node).layout">
            <ngx-formad-page-nodes [nodes]="row(node).children" [forms]="forms()" />
          </div>
        }
        @case ('content') {
          <div class="ngx-formad-content" [class]="content(node).layout ?? ''"></div>
        }
      }
    }
  `,
})
export class PageNodesView {
  /** The nodes at this level of the page. */
  readonly nodes = input.required<readonly LayoutNode[]>();
  /** The step's live forms, indexed by name, for resolving a form node in place. */
  readonly forms = input.required<ReadonlyMap<string, LiveForm>>();

  // The live form a node binds to (its state + effects) — undefined if the step
  // never materialized it (a name with no pool entry), so the `@if` skips it.
  protected liveFormFor(name: string): LiveForm | undefined {
    return this.forms().get(name);
  }

  // A node is shown unless its `visibleWhen` says otherwise — the same default the
  // registry uses for completion, so what renders and what gates stay in step.
  protected visible(node: { visibleWhen?: () => boolean }): boolean {
    return node.visibleWhen ? node.visibleWhen() : true;
  }

  // Narrowing helpers for the template's `@switch` (templates can't cast).
  protected form(node: LayoutNode): FormNode {
    return node as FormNode;
  }
  protected component(node: LayoutNode): ComponentNode {
    return node as ComponentNode;
  }
  protected row(node: LayoutNode): RowNode {
    return node as RowNode;
  }
  protected content(node: LayoutNode): ContentNode {
    return node as ContentNode;
  }
}

/** Renders a live step's pages, each wrapped in its own layout slot, delegating the
 *  contents to the recursive `PageNodesView`. Drop it into a chrome's step body —
 *  eagerly, or inside an `@defer` to honour the step's `deferTrigger()`. */
@Component({
  selector: 'ngx-formad-step-page',
  imports: [PageNodesView],
  host: { style: 'display: contents' },
  // A page only gets a wrapping element when it actually declares a layout class;
  // otherwise its nodes render straight into the chrome, keeping the DOM flat.
  template: `
    @for (page of step().pages; track $index) {
      @if (page.options.layout; as layout) {
        <div class="ngx-formad-page" [class]="layout">
          <ngx-formad-page-nodes [nodes]="page.children" [forms]="formMap()" />
        </div>
      } @else {
        <ngx-formad-page-nodes [nodes]="page.children" [forms]="formMap()" />
      }
    }
  `,
})
export class StepPageView {
  readonly step = input.required<LiveStep>();

  // One lookup per step, keyed by form name — the renderer resolves each FormNode
  // back to the instance the controller already materialized (and registered for
  // completion), rather than re-instantiating anything.
  protected readonly formMap = computed(() => {
    const map = new Map<string, LiveForm>();
    for (const form of this.step().forms) map.set(form.name, form);
    return map;
  });
}
