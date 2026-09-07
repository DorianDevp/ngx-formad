import { Directive, input } from '@angular/core';
import { LayoutClasses } from './layout-adapter';

/** Places its host in the parent grid: the adapter's class on top of the host's own, its styles inline. */
@Directive({
  selector: '[ngxFormadItem]',
  host: { '[class]': 'item().class', '[style]': 'item().style' },
})
export class LayoutItem {
  readonly item = input.required<LayoutClasses>({ alias: 'ngxFormadItem' });
}
