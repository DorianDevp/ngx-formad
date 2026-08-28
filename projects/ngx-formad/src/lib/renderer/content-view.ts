import {
  Component,
  effect,
  EffectRef,
  ElementRef,
  inject,
  Injector,
  input,
  Renderer2,
  untracked,
} from '@angular/core';
import { Reactive } from '../builders/dynamic-component';
import { ContentAttr, ContentChild, isContentTag } from '../builders/content';

// Draws a content block's tag tree. It builds DOM through `Renderer2` instead of a
// template, for one structural reason: a template can only name tags literally, so
// recursing through a component would put that component's host element between a
// `<ul>` and its `<li>` - invalid markup the author never asked for. Creating the
// elements directly keeps the tree exactly as authored, with no wrapper anywhere.
//
// Reactivity is per value, not per tree: a constant is written once, and only an
// authored getter gets an `effect`, so a page of static prose subscribes to nothing.
// The tree is repainted when `children` changes - the same instance is reused when a
// host swaps one form (or page) for another whose nodes track to the same key, and
// stale prose under new fields would be worse than the cost of rebuilding.

/** Attributes that are true HTML booleans: present means true, and the empty string
 *  is the canonical value. Everything else - `aria-*` above all - is an enumerated
 *  *string* attribute, where `aria-hidden=""` reads as "not hidden", so `true` there
 *  has to be written as the word. */
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

/** Attributes whose value is a URL - the ones a scheme check has to cover. */
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

// Schemes a content URL may use, plus raster/vector-free data URLs for an inline
// image. Anything else - `javascript:`, `vbscript:`, `data:text/html`, `data:image/
// svg+xml` (which can carry script) - is refused. Mirrors what Angular's own URL
// sanitizer allows, minus the parts a prose block has no business with.
const SAFE_URL =
  /^(?:(?:https?|mailto|tel|ftp|sms|geo|callto):|data:image\/(?:png|jpe?g|gif|webp|avif);|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

function isSafeUrl(value: string): boolean {
  // Browsers drop tabs, newlines and C0 controls from *anywhere* in a URL before
  // resolving its scheme, so a newline inside `javascript:` still runs. Strip them
  // first or the guard inspects a string the browser will never see. Only the check
  // sees the stripped value; what gets written is what the author wrote.
  return SAFE_URL.test(value.replace(/[\u0000-\u0020\u00a0\u2028\u2029]/g, ''));
}

// An attribute name is refused outright when it can carry code: `on*` is an inline
// event handler, and `srcdoc`/`formaction`-style names are covered by the URL check.
// The guard lives here, not in the builder, because the renderer is what a tree from
// JSON also goes through.
function isSafeAttrName(name: string): boolean {
  return /^[a-z][a-z0-9:_.-]*$/i.test(name) && !/^on/i.test(name);
}

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

  // Every per-value effect of the current paint, so a repaint can drop them.
  private bindings: EffectRef[] = [];

  constructor() {
    // Painting from an effect rather than `afterNextRender` does two things: the
    // tree follows its input, and the markup exists as soon as change detection
    // runs (so it is in the server's output too, not only after hydration).
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
    if (child.kind === 'text') {
      const text = this.renderer.createText('');
      this.bind(child.value, (value) => this.renderer.setValue(text, String(value)));
      this.renderer.appendChild(parent, text);
      return;
    }

    // A tree that did not come from the builder (JSON) can name anything; an
    // unknown tag draws nothing rather than being created blindly.
    if (!isContentTag(child.tag)) return;

    const el = this.renderer.createElement(child.tag) as HTMLElement;

    if (child.className !== undefined) {
      this.bind(child.className, (value) => this.renderer.setAttribute(el, 'class', value));
    }
    for (const attr of child.attrs ?? []) this.bindAttr(el, attr);
    for (const listener of child.listeners ?? []) {
      this.renderer.listen(el, listener.event, listener.handler);
    }
    // `hidden` says what is meant; the inline `display` is what makes it hold, since
    // `[hidden]` comes from the UA stylesheet and any author `display` rule outranks
    // it - and this library tells authors that classes are theirs.
    const visibleWhen = child.visibleWhen;
    if (visibleWhen) {
      this.bind(visibleWhen, (visible) => {
        if (visible) {
          this.renderer.removeAttribute(el, 'hidden');
          this.renderer.removeStyle(el, 'display');
          return;
        }
        this.renderer.setAttribute(el, 'hidden', '');
        this.renderer.setStyle(el, 'display', 'none');
      });
    }

    this.paint(child.children ?? [], el);
    this.renderer.appendChild(parent, el);
  }

  private bindAttr(el: HTMLElement, attr: ContentAttr): void {
    if (!isSafeAttrName(attr.name)) return;
    const guarded = URL_ATTRS.has(attr.name.toLowerCase());

    this.bind(attr.value, (value) => {
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

  // The one place a `Reactive` becomes DOM: a constant is applied once, a getter is
  // applied now (so the first paint is correct, not one frame late) and then kept in
  // step by an effect owned by this component.
  private bind<V>(source: Reactive<V>, apply: (value: V) => void): void {
    if (typeof source !== 'function') {
      apply(source);
      return;
    }
    const get = source as () => V;
    apply(untracked(get));
    this.bindings.push(effect(() => apply(get()), { injector: this.injector }));
  }
}
