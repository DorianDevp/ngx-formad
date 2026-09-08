import { NgComponentOutlet } from '@angular/common';
import { Component, computed, Injector, input } from '@angular/core';
import { LayoutNode, LayoutNodeKind } from '../builders/nodes';
import { ContentView } from '../renderer/content-view';
import { FormRenderer } from '../renderer/form-renderer';
import { MountPoint } from '../renderer/mount-point';
import { LiveForm, LiveStep } from './materialize-step';

interface PageNodeRow {
  readonly node: LayoutNode;
  readonly live: LiveForm | null;
  readonly injector: Injector | null;
}

/** Draws one level of a page's nodes: live forms, the step's components, content blocks and nested rows. */
@Component({
  selector: 'ngx-formad-page-nodes',
  imports: [FormRenderer, NgComponentOutlet, ContentView, PageNodesView],
  host: { style: 'display: contents' },
  template: `
    @for (row of rows(); track row.node) {
      @switch (row.node.kind) {
        @case (kinds.Form) {
          @if (row.live) {
            <ngx-formad-form [state]="row.live.state" />
          }
        }
        @case (kinds.Component) {
          @if (row.injector) {
            <ng-container *ngComponentOutlet="mountPoint; injector: row.injector" />
          }
        }
        @case (kinds.Row) {
          <div class="ngx-formad-row" [class]="row.node.layout">
            <ngx-formad-page-nodes [nodes]="row.node.children" [step]="step()" />
          </div>
        }
        @case (kinds.Content) {
          <div class="ngx-formad-content" [class]="row.node.layout ?? ''">
            @if (row.node.children.length) {
              <ngx-formad-content [children]="row.node.children" />
            }
          </div>
        }
      }
    }
  `,
})
export class PageNodesView {
  readonly nodes = input.required<readonly LayoutNode[]>();

  readonly step = input.required<LiveStep>();

  protected readonly kinds = LayoutNodeKind;

  protected readonly mountPoint = MountPoint;

  private readonly forms = computed(() => new Map(this.step().forms.map((form) => [form.name, form])));

  protected readonly rows = computed<readonly PageNodeRow[]>(() =>
    this.nodes()
      .filter((node) => node.kind === LayoutNodeKind.Row || (node.visibleWhen?.() ?? true))
      .map((node) => ({
        node,
        live: node.kind === LayoutNodeKind.Form ? (this.forms().get(node.name) ?? null) : null,
        injector: node.kind === LayoutNodeKind.Component ? (this.step().components.get(node) ?? null) : null,
      })),
  );
}

/** Draws every page of a live step. */
@Component({
  selector: 'ngx-formad-step-page',
  imports: [PageNodesView],
  host: { style: 'display: contents' },
  template: `
    @for (page of step().pages; track $index) {
      @if (page.options.layout; as layout) {
        <div class="ngx-formad-page" [class]="layout">
          <ngx-formad-page-nodes [nodes]="page.children" [step]="step()" />
        </div>
      } @else {
        <ngx-formad-page-nodes [nodes]="page.children" [step]="step()" />
      }
    }
  `,
})
export class StepPageView {
  readonly step = input.required<LiveStep>();
}
