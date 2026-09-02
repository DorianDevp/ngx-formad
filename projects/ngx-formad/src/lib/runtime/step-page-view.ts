import { FLOW_ENVIRONMENT } from '../renderer/flow-environment';
import { Component, computed, input, inject } from '@angular/core';
import { ContentChild } from '../builders/content';
import { ComponentNode, ContentNode, FormNode, LayoutNode, RowNode } from '../builders/nodes';
import { ComponentOutlet } from '../renderer/component-outlet';
import { ContentView } from '../renderer/content-view';
import { FormRenderer } from '../renderer/form-renderer';
import { LiveForm, LiveStep } from './materialize-step';

@Component({
  selector: 'ngx-formad-page-nodes',
  imports: [FormRenderer, ComponentOutlet, ContentView, PageNodesView],
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
  readonly nodes = input.required<readonly LayoutNode[]>();

  readonly forms = input.required<ReadonlyMap<string, LiveForm>>();

  liveFormFor(name: string): LiveForm | undefined {
    return this.forms().get(name);
  }

  visible(node: { visibleWhen?: () => boolean }): boolean {
    return node.visibleWhen ? node.visibleWhen() : true;
  }

  form(node: LayoutNode): FormNode {
    return node as FormNode;
  }

  component(node: LayoutNode): ComponentNode {
    return node as ComponentNode;
  }

  row(node: LayoutNode): RowNode {
    return node as RowNode;
  }

  content(node: LayoutNode): ContentNode {
    return node as ContentNode;
  }

  contentChildren(node: LayoutNode): readonly ContentChild[] {
    return (node as ContentNode).children ?? [];
  }
}

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

  readonly formMap = computed(() => {
    const map = new Map<string, LiveForm>();
    for (const form of this.step().forms) map.set(form.name, form);
    return map;
  });
}
