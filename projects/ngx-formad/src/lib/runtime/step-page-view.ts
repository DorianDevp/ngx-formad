import { FLOW_ENVIRONMENT } from '../renderer/flow-environment';
import { Component, computed, input, inject } from '@angular/core';
import { ContentChild } from '../builders/content';
import {
  ComponentNode,
  ContentNode,
  FormNode,
  LayoutNode,
  RowNode,
  ValueControlNode,
} from '../builders/nodes';
import { ComponentOutlet } from '../renderer/component-outlet';
import { ContentView } from '../renderer/content-view';
import { ControlOutlet } from '../renderer/control-outlet';
import { FormRenderer } from '../renderer/form-renderer';
import { LiveControl, LiveForm, LiveStep } from './materialize-step';

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
  imports: [FormRenderer, ComponentOutlet, ContentView, ControlOutlet, PageNodesView],
  host: { style: 'display: contents' },
  template: `
    @for (node of nodes(); track node) {
      @switch (node.kind) {
        @case ('form') {
          @if (visible(form(node))) {
            @if (liveFormFor(form(node).name); as live) {
              <ngx-formad-form [state]="live.state" [effects]="live.effects" />
            }
          }
        }
        @case ('control') {
          @if (visible(control(node))) {
            @if (liveControlFor(control(node).name); as live) {
              <ngx-formad-control-outlet [control]="live" />
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
            <ngx-formad-page-nodes [nodes]="row(node).children" [forms]="forms()" [controls]="controls()" />
          </div>
        }
        @case ('content') {
          @if (visible(content(node))) {
            <div class="ngx-formad-content" [class]="content(node).layout ?? ''">
              @if (contentChildren(node).length) {
                <ngx-formad-content [children]="contentChildren(node)" />
              }
            </div>
          }
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
  /** The step's live standalone controls, indexed by name, resolved the same way. */
  readonly controls = input.required<ReadonlyMap<string, LiveControl>>();

  // The live form a node binds to (its state + effects) — undefined if the step
  // never materialized it (a name with no pool entry), so the `@if` skips it.
  protected liveFormFor(name: string): LiveForm | undefined {
    return this.forms().get(name);
  }

  protected liveControlFor(name: string): LiveControl | undefined {
    return this.controls().get(name);
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
  protected control(node: LayoutNode): ValueControlNode {
    return node as ValueControlNode;
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
  // A node built by hand (or deserialized from a 0.6-era config) may carry no
  // children at all; that is the bare slot, not a crash.
  protected contentChildren(node: LayoutNode): readonly ContentChild[] {
    return (node as ContentNode).children ?? [];
  }
}

/** Renders a live step's pages, each wrapped in its own layout slot, delegating the
 *  contents to the recursive `PageNodesView`. Drop it into a chrome's step body —
 *  eagerly, or inside an `@defer` to honour the step's `deferTrigger()`. */
@Component({
  // Publishes the active step's flow environment for every dynamically created
  // component below (page components, standalone controls, form controls) — a
  // getter, since the step under one static provider changes.
  providers: [
    {
      provide: FLOW_ENVIRONMENT,
      useFactory: () => {
        const view = inject(StepPageView);

        return () => view.step().environment;
      },
    },
  ],
  selector: 'ngx-formad-step-page',
  imports: [PageNodesView],
  host: { style: 'display: contents' },
  // A page only gets a wrapping element when it actually declares a layout class;
  // otherwise its nodes render straight into the chrome, keeping the DOM flat.
  template: `
    @for (page of step().pages; track page) {
      @if (page.options.layout; as layout) {
        <div class="ngx-formad-page" [class]="layout">
          <ngx-formad-page-nodes [nodes]="page.children" [forms]="formMap()" [controls]="controlMap()" />
        </div>
      } @else {
        <ngx-formad-page-nodes [nodes]="page.children" [forms]="formMap()" [controls]="controlMap()" />
      }
    }
  `,
})
export class StepPageView {
  readonly step = input.required<LiveStep>();

  // One lookup per step, keyed by pool name — the renderer resolves each form or
  // control node back to the instance the controller already materialized (and
  // registered for completion), rather than re-instantiating anything.
  protected readonly formMap = computed(() => {
    const map = new Map<string, LiveForm>();
    for (const form of this.step().forms) map.set(form.name, form);
    return map;
  });
  protected readonly controlMap = computed(() => {
    const map = new Map<string, LiveControl>();
    for (const control of this.step().controls) map.set(control.name, control);
    return map;
  });
}
