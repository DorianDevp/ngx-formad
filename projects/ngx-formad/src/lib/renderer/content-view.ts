import {
  Component,
  computed,
  effect,
  isSignal,
  Signal,
  EffectRef,
  ElementRef,
  inject,
  Injector,
  input,
  Renderer2,
  untracked,
} from '@angular/core';
import { AttrValue, ContentAttr, ContentChild, ContentChildKind, ContentTagChild, isContentTag } from '../builders/content';


const BOOLEAN_ATTRS = new Set([
  'autofocus',
  'checked',
  'controls',
  'default',
  'disabled',
  'hidden',
  'inert',
  'ismap',
  'loop',
  'multiple',
  'muted',
  'novalidate',
  'open',
  'playsinline',
  'readonly',
  'required',
  'reversed',
  'selected',
]);

const URL_ATTRS = new Set([
  'action',
  'background',
  'cite',
  'data',
  'formaction',
  'href',
  'longdesc',
  'manifest',
  'ping',
  'poster',
  'profile',
  'src',
  'srcset',
  'xlink:href',
]);

const SAFE_URL =
  /^(?:(?:https?|mailto|tel|ftp|sms|geo|callto):|data:image\/(?:png|jpe?g|gif|webp|avif);|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

function isSafeUrl(value: string): boolean {
  return SAFE_URL.test(value.replace(/[\u0000-\u0020\u00a0\u2028\u2029]/g, ''));
}

function isSafeAttrName(name: string): boolean {
  return /^[a-z][a-z0-9:_.-]*$/i.test(name) && !/^on/i.test(name);
}

/** Draws a content block's tag tree straight into the DOM, with per-value effects only where a getter was authored. */
@Component({
  selector: 'ngx-formad-content',
  host: { style: 'display: contents' },
  template: '',
})
export class ContentView {
  readonly children = input.required<readonly ContentChild[]>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly renderer = inject(Renderer2);

  private readonly injector = inject(Injector);

  private bindings: EffectRef[] = [];

  constructor() {
    effect(() => {
      const children = this.children() ?? [];
      untracked(() => this.repaint(children));
    });
  }

  private repaint(children: readonly ContentChild[]): void {
    for (const binding of this.bindings) binding.destroy();
    this.bindings = [];

    const host = this.host.nativeElement;
    while (host.firstChild) this.renderer.removeChild(host, host.firstChild);

    this.paint(children, host);
  }

  private paint(children: readonly ContentChild[], parent: Node): void {
    for (const child of children) this.mount(child, parent);
  }

  private mount(child: ContentChild, parent: Node): void {
    if (child.kind === ContentChildKind.Text) {
      const text = this.renderer.createText('');
      this.bind<string | number>(child.value, (value) => this.renderer.setValue(text, String(value)));
      this.renderer.appendChild(parent, text);

      return;
    }
    if (!isContentTag(child.tag)) return;

    const el: HTMLElement = this.renderer.createElement(child.tag);
    if (child.className !== undefined) {
      this.bind<string>(child.className, (value) => this.renderer.setAttribute(el, 'class', value));
    }
    for (const attr of child.attrs ?? []) this.bindAttr(el, attr);
    for (const listener of child.listeners ?? []) {
      this.renderer.listen(el, listener.event, listener.handler);
    }
    this.bindVisibility(el, child);
    this.paint(child.children ?? [], el);
    this.renderer.appendChild(parent, el);
  }

  private bindVisibility(el: HTMLElement, child: ContentTagChild): void {
    const visibleWhen = child.visibleWhen;
    if (!visibleWhen) return;

    this.bind(computed(visibleWhen), (visible) => {
      if (visible) {
        this.renderer.removeAttribute(el, 'hidden');
        this.renderer.removeStyle(el, 'display');

        return;
      }
      this.renderer.setAttribute(el, 'hidden', '');
      this.renderer.setStyle(el, 'display', 'none');
    });
  }

  private bindAttr(el: HTMLElement, attr: ContentAttr): void {
    if (!isSafeAttrName(attr.name)) return;

    const guarded = URL_ATTRS.has(attr.name.toLowerCase());
    this.bind<AttrValue>(attr.value, (value) => {
      if (value === null || value === undefined) {
        this.renderer.removeAttribute(el, attr.name);

        return;
      }
      if (value === false && BOOLEAN_ATTRS.has(attr.name)) {
        this.renderer.removeAttribute(el, attr.name);

        return;
      }
      const written = value === true && BOOLEAN_ATTRS.has(attr.name) ? '' : String(value);
      if (guarded && written !== '' && !isSafeUrl(written)) {
        this.renderer.removeAttribute(el, attr.name);

        return;
      }
      this.renderer.setAttribute(el, attr.name, written);
    });
  }

  /** A constant is applied once; a live value is applied now and then followed by its own effect. */
  private bind<V>(source: V | Signal<V>, apply: (value: V) => void): void {
    if (!isSignal(source)) {
      apply(source);

      return;
    }
    apply(untracked(source));
    this.bindings = [...this.bindings, effect(() => apply(source()), { injector: this.injector })];
  }
}
