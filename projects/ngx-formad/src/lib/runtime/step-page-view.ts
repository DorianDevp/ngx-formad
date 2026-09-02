import { Component, computed, inject, input } from '@angular/core';
import { ContentChild } from '../builders/content';
import { LayoutNode, LayoutNodeKind } from '../builders/nodes';
import { ComponentOutlet } from '../renderer/component-outlet';
import { ContentView } from '../renderer/content-view';
import { FLOW_ENVIRONMENT } from '../renderer/flow-environment';
import { FormRenderer } from '../renderer/form-renderer';
import { LiveForm, LiveStep } from './materialize-step';

interface PageNodeRow {
  readonly node: LayoutNode;
  readonly live: LiveForm | null;
  readonly content: readonly ContentChild[];
}

/** Draws one level of a page's nodes: live forms, components, content blocks and nested rows. */
@Component({
  selector: 'ngx-formad-page-nodes',
  imports: [FormRenderer, ComponentOutlet, ContentView, PageNodesView],
  host: { style: 'display: contents' },
  template: `
    @for (row of rows(); track row.node) {
      @switch (row.node.kind) {
        @case (kinds.Form) {
          @if (row.live) {
            <ngx-formad-form [state]="row.live.state" [effects]="row.live.effects" />
          }
        }
        @case (kinds.Component) {
          <ngx-formad-component-outlet [node]="row.node" />
        }
        @case (kinds.Row) {
          <div class="ngx-formad-row" [class]="row.node.layout">
            <ngx-formad-page-nodes [nodes]="row.node.children" [forms]="forms()" />
          </div>
        }
        @case (kinds.Content) {
          <div class="ngx-formad-content" [class]="row.node.layout ?? ''">
            @if (row.content.length) {
              <ngx-formad-content [children]="row.content" />
            }
          </div>
        }
      }
    }
  `,
})
export class PageNodesView {
  readonly nodes = input.required<readonly LayoutNode[]>();

  readonly forms = input.required<ReadonlyMap<string, LiveForm>>();

  readonly kinds = LayoutNodeKind;

  readonly rows = computed<readonly PageNodeRow[]>(() =>
    this.nodes()
      .filter((node) => (node.kind === LayoutNodeKind.Row ? true : (node.visibleWhen?.() ?? true)))
      .map((node) => ({
        node,
        live: node.kind === LayoutNodeKind.Form ? (this.forms().get(node.name) ?? null) : null,
        content: node.kind === LayoutNodeKind.Content ? (node.children ?? []) : [],
      })),
  );
}

/** Draws every page of a live step and publishes the step's flow environment to the components below. */
@Component({
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
  template: `
    @for (page of step().pages; track page) {
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

  readonly formMap = computed(() => new Map(this.step().forms.map((form) => [form.name, form])));
}
