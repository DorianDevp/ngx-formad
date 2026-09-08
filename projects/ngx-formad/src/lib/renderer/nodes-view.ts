import { NgComponentOutlet } from '@angular/common';
import { Component, input } from '@angular/core';
import { RenderNodeKind } from '../form-config/form-config';
import { ContentView } from './content-view';
import { FormLevel } from './form-view';
import { MountPoint } from './mount-point';

/**
 * Draws one level of a form's view and recurses into groups, rows and array items.
 *
 * Everything shown here was decided when the form was instantiated: the rows are a computed over the level, and a
 * row's mount point creates its formField where the row stands, from the mount the row provides.
 */
@Component({
  selector: 'ngx-formad-nodes',
  imports: [NgComponentOutlet, ContentView],
  host: { style: 'display: contents' },
  template: `
    <div [class]="level().container.class" [style]="level().container.style">
      @for (row of level().rows(); track row.node) {
        @switch (row.kind) {
          @case (kinds.Control) {
            <ng-container *ngComponentOutlet="mountPoint; injector: row.injector" />
          }
          @case (kinds.Group) {
            <fieldset [class]="row.item.class" [style]="row.item.style">
              @if (row.node.label) {
                <legend class="ngx-formad-group-label">{{ row.node.label }}</legend>
              }
              <ngx-formad-nodes [level]="row.level" />
            </fieldset>
          }
          @case (kinds.Array) {
            <fieldset [class]="row.item.class" [style]="row.item.style">
              @if (row.node.node.label) {
                <legend class="ngx-formad-group-label">{{ row.node.node.label }}</legend>
              }
              @for (item of row.items(); track item.level) {
                <div class="ngx-formad-array-item">
                  <ngx-formad-nodes [level]="item.level" />
                  @if (row.node.node.removable !== false) {
                    <button type="button" class="ngx-formad-array-remove" (click)="row.remove($index)">
                      {{ row.node.node.removeLabel ?? 'Remove' }}
                    </button>
                  }
                </div>
              }
              @if (row.node.node.addable !== false) {
                <button type="button" class="ngx-formad-array-add" (click)="row.add()">
                  {{ row.node.node.addLabel ?? 'Add' }}
                </button>
              }
            </fieldset>
          }
          @case (kinds.Content) {
            <div [class]="row.item.class" [style]="row.item.style">
              <ngx-formad-content [children]="row.node.children" />
            </div>
          }
          @case (kinds.Row) {
            <div [class]="row.item.class" [style]="row.item.style">
              <ngx-formad-nodes [level]="row.level" />
            </div>
          }
        }
      }
    </div>
  `,
})
export class NodesView {
  readonly level = input.required<FormLevel>();

  protected readonly kinds = RenderNodeKind;

  protected readonly mountPoint = MountPoint;
}
