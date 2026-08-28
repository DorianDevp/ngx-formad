import { Reactive, toGetter } from './dynamic-component';

// Prose is the one thing a page could not express as config. A form is data, a
// component slot is data, a layout row is data - but the sentence above the form,
// the "or" between two blocks, the hint with a link in it, all had to be smuggled
// in as a one-off component. `addContent` closes that hole: you describe markup
// with a builder whose methods ARE the tags, and the result is the same kind of
// node tree everything else in this library is - visibility is a `visibleWhen`
// getter, dynamic text is a getter, and nothing is a template the author writes.
//
// Two rules keep it honest:
//  • Nothing is interpolated as markup. Text becomes text nodes and attributes are
//    set one by one, so there is no `innerHTML` on this path. What a *config* may
//    ask for is bounded three ways, all enforced by the renderer (so a tree that
//    arrived as JSON is bounded too, not just one the builder wrote): the tag set
//    is closed (`CONTENT_TAGS`, no `<script>`), attribute names beginning with
//    `on` are refused, and URL-bearing attributes are scheme-checked. It is not a
//    full sanitizer - `style` is allowed, as it is in Angular's own bindings - so
//    genuinely untrusted content still belongs behind a component you control.
//  • A value stays exactly as authored: a string is a string on the node, a getter
//    is a getter. The renderer writes a constant once and only subscribes to what
//    is actually a function, and a static tree survives a round trip through JSON.

/** The tags a content block may draw. Deliberately prose-shaped: structure, text,
 *  lists, links, images. Anything interactive beyond a link or a button is a
 *  component's job (`addComponent`), not a content block's. */
export const CONTENT_TAGS = [
  'div',
  'section',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'blockquote',
  'figure',
  'figcaption',
  'pre',
  'hr',
  'span',
  'strong',
  'em',
  'small',
  'code',
  'a',
  'br',
  'img',
  'button',
] as const;

export type ContentTag = (typeof CONTENT_TAGS)[number];

/** True for a tag this library will draw - the renderer's own guard, so a node
 *  tree that did not come from the builder (a JSON config) cannot smuggle in an
 *  element the vocabulary does not allow. */
export function isContentTag(tag: string): tag is ContentTag {
  return (CONTENT_TAGS as readonly string[]).includes(tag);
}

/** What an attribute may hold. `null`/`undefined`/`false` remove the attribute,
 *  `true` writes it empty (`hidden`, `aria-hidden` and friends). */
export type AttrValue = string | number | boolean | null | undefined;

/** Text a content node draws: a value, or a getter for text that changes. */
export type ContentText = Reactive<string | number>;

/** Attributes, listeners and visibility any content tag accepts. */
export interface ContentOptions {
  /** The tag's class list - the whole styling surface, since the library ships no
   *  look of its own for content. Reactive, so a state class can follow a signal. */
  readonly className?: Reactive<string>;
  /** Anything else the tag needs: `id`, `role`, `aria-*`, `data-*`, `title`. */
  readonly attrs?: Readonly<Record<string, Reactive<AttrValue>>>;
  /** DOM listeners by event name - how a link or button in prose does something. */
  readonly on?: Readonly<Record<string, (event: Event) => void>>;
  /** Hides the tag (and its subtree) while false; read reactively. */
  readonly visibleWhen?: () => boolean;
}

export interface AnchorOptions extends ContentOptions {
  readonly href?: Reactive<string>;
  readonly target?: Reactive<string>;
  readonly rel?: Reactive<string>;
}

export interface ImageOptions extends ContentOptions {
  readonly src: Reactive<string>;
  readonly alt?: Reactive<string>;
}

export interface ButtonOptions extends ContentOptions {
  /** Defaults to `button`: prose sits inside forms, and a bare `<button>` there
   *  submits. A content button never submits unless it says so. */
  readonly type?: 'button' | 'submit' | 'reset';
}

/** One attribute: its name and its value, as authored (a value or a getter). */
export interface ContentAttr {
  readonly name: string;
  readonly value: Reactive<AttrValue>;
}

/** One normalized listener: the DOM event and its handler. */
export interface ContentListener {
  readonly event: string;
  readonly handler: (event: Event) => void;
}

/** A text run inside a tag (or at the top level of a block). */
export interface ContentTextChild {
  readonly kind: 'text';
  readonly value: ContentText;
}

/** One element: its tag, its attributes/listeners, its own visibility gate, and
 *  the children it wraps. */
export interface ContentTagChild {
  readonly kind: 'tag';
  readonly tag: ContentTag;
  readonly className?: Reactive<string>;
  readonly attrs: readonly ContentAttr[];
  readonly listeners: readonly ContentListener[];
  readonly visibleWhen?: () => boolean;
  readonly children: readonly ContentChild[];
}

/** Anything a content block holds. */
export type ContentChild = ContentTextChild | ContentTagChild;

/** A nested build: it gets a builder and whatever it adds becomes the children of
 *  the tag it was given to. */
export type ContentBuild = (content: ContentBuilder) => unknown;

/**
 * How every tag method may be called: its text, its options, and the children to
 * nest inside it - each one optional, and the object/function shapes tell them
 * apart, so a tag that wants only some of them says only that much:
 *
 * ```ts
 * c.p('A line')                                  // text
 *  .p(() => summary())                           // text that follows a signal
 *  .p('A line', { className: 'hint' })           // text + options
 *  .a('Read the terms', { href: '/t' }, (a) => a.span('open_in_new'))  // + children
 *  .a('Read it', (a) => a.span('open_in_new'))   // children, no options
 *  .div({ className: 'callout' }, (d) => …)      // a container: options + children
 *  .ul((list) => list.li('First').li('Second'))  // a container, nothing else
 * ```
 *
 * In first position a getter is text and a callback is the children - a text getter
 * takes nothing, a build takes the builder, which separates them in the types and
 * at run time.
 */
export type TagArgs =
  | [text?: ContentText, options?: ContentOptions, insert?: ContentBuild]
  | [text: ContentText, insert: ContentBuild]
  | [options: ContentOptions, insert?: ContentBuild]
  | [insert: ContentBuild];

// The mutable twin of `ContentTagChild`: `insert` splices into a tag already
// pushed, so the tree is built mutable and handed out readonly.
interface MutableTag {
  kind: 'tag';
  tag: ContentTag;
  className?: Reactive<string>;
  attrs: ContentAttr[];
  listeners: ContentListener[];
  visibleWhen?: () => boolean;
  children: ContentChild[];
}

function isPlainOptions(value: unknown): value is ContentOptions {
  return typeof value === 'object' && value !== null;
}

function textChild(value: ContentText): ContentTextChild {
  return { kind: 'text', value };
}

/**
 * Turns "text or children" into children. A callback and a text getter are the
 * same type to TypeScript (`() => string` is assignable to `(c) => unknown`), so
 * arity cannot be trusted - rest and defaulted parameters both report 0. Instead
 * the callback is *run* as a build: if it added anything, those are the children;
 * if it added nothing and handed back a string or a number, it was a text getter
 * all along and is kept as one, still reactive. That way neither mistake is silent.
 */
function childrenFrom(source: ContentBuild | ContentText): ContentChild[] {
  if (typeof source !== 'function') return [textChild(source)];

  const nested = new ContentBuilder();
  const returned = (source as ContentBuild)(nested);
  const nodes = nested.drain();
  if (nodes.length) return nodes;
  if (typeof returned === 'string' || typeof returned === 'number') {
    return [textChild(source as ContentText)];
  }
  return nodes;
}

/**
 * Builds the markup of one content block. Every tag method appends at *this* level
 * and chains, so the call order is the render order. Two methods work on the tag
 * you just added instead of the level - that is what writes a sentence with things
 * inside it, without nesting the sentence in a callback:
 *
 *  • `insert(build, at?)` puts children **inside** that tag and leaves the cursor
 *    on it, so what follows keeps writing into the same tag.
 *  • `continue(text, at?)` keeps writing text in it, after whatever is there.
 *
 * ```ts
 * page.addContent({ layout: 'callout' }, (c) =>
 *   c.p('We found ')
 *    .insert((p) => p.strong(() => `${count()} products`))
 *    .continue(' in your basket.')
 *    .p('Check the ')
 *    .insert((p) => p.a('warranty terms', { href: '/terms' }))
 *    .continue(' first.'),
 * );
 * // <p>We found <strong>2 products</strong> in your basket.</p>
 * // <p>Check the <a href="/terms">warranty terms</a> first.</p>
 * ```
 */
export class ContentBuilder {
  private readonly children: ContentChild[] = [];
  // The tag `insert`/`continue` write into: the last one pushed at THIS level. A
  // bare `text` run clears it - there is no tag to write into after it.
  private last: MutableTag | null = null;

  /** A bare text run at this level. */
  text(value: ContentText): this {
    this.children.push(textChild(value));
    this.last = null;
    return this;
  }

  /**
   * Nests children inside the tag added just before - at `at` among its children,
   * or after them. The cursor stays on that tag, so a following `continue` (or
   * another `insert`) still writes into it. With no tag yet, the children land at
   * this level, so a stray `insert` degrades instead of throwing.
   *
   * Handed text instead of a build it inserts a text run, and a callback that adds
   * nothing but returns text is kept as a text getter - so neither mistake between
   * the two (they are the same type to TypeScript) draws nothing or `[object
   * Object]`.
   */
  insert(build: ContentBuild | ContentText, at?: number): this {
    const nodes = childrenFrom(build);
    const target = this.last;
    if (!target) {
      this.children.push(...nodes);
      return this;
    }
    target.children.splice(spliceIndex(target, at), 0, ...nodes);
    return this;
  }

  /**
   * Keeps writing text in the tag added just before - the other half of `insert`,
   * for the words after the `<strong>` or the link.
   */
  continue(value: ContentText, at?: number): this {
    const target = this.last;
    const child = textChild(value);
    if (!target) {
      this.children.push(child);
      return this;
    }
    target.children.splice(spliceIndex(target, at), 0, child);
    return this;
  }

  // ── Structure ──
  /** `<div>` - a plain container, the hook most design systems style. */
  div(...args: TagArgs): this {
    return this.push('div', args);
  }
  section(...args: TagArgs): this {
    return this.push('section', args);
  }
  p(...args: TagArgs): this {
    return this.push('p', args);
  }
  h1(...args: TagArgs): this {
    return this.push('h1', args);
  }
  h2(...args: TagArgs): this {
    return this.push('h2', args);
  }
  h3(...args: TagArgs): this {
    return this.push('h3', args);
  }
  h4(...args: TagArgs): this {
    return this.push('h4', args);
  }
  h5(...args: TagArgs): this {
    return this.push('h5', args);
  }
  h6(...args: TagArgs): this {
    return this.push('h6', args);
  }
  ul(...args: TagArgs): this {
    return this.push('ul', args);
  }
  ol(...args: TagArgs): this {
    return this.push('ol', args);
  }
  li(...args: TagArgs): this {
    return this.push('li', args);
  }
  dl(...args: TagArgs): this {
    return this.push('dl', args);
  }
  dt(...args: TagArgs): this {
    return this.push('dt', args);
  }
  dd(...args: TagArgs): this {
    return this.push('dd', args);
  }
  blockquote(...args: TagArgs): this {
    return this.push('blockquote', args);
  }
  figure(...args: TagArgs): this {
    return this.push('figure', args);
  }
  figcaption(...args: TagArgs): this {
    return this.push('figcaption', args);
  }
  pre(...args: TagArgs): this {
    return this.push('pre', args);
  }

  // ── Inline ──
  span(...args: TagArgs): this {
    return this.push('span', args);
  }
  strong(...args: TagArgs): this {
    return this.push('strong', args);
  }
  em(...args: TagArgs): this {
    return this.push('em', args);
  }
  small(...args: TagArgs): this {
    return this.push('small', args);
  }
  code(...args: TagArgs): this {
    return this.push('code', args);
  }

  // ── Void tags: nothing to wrap, so options are the only argument ──
  hr(options: ContentOptions = {}): this {
    return this.push('hr', [options]);
  }
  br(options: ContentOptions = {}): this {
    return this.push('br', [options]);
  }

  // ── Tags with attributes of their own ──
  /** `<a>` - `href` is an option, and `on: { click }` covers in-app navigation. */
  a(text?: ContentText, options?: AnchorOptions, insert?: ContentBuild): this;
  a(text: ContentText, insert: ContentBuild): this;
  a(options: AnchorOptions, insert?: ContentBuild): this;
  a(
    first?: ContentText | AnchorOptions,
    second?: AnchorOptions | ContentBuild,
    third?: ContentBuild,
  ): this {
    const { children, options } = classify<AnchorOptions>([first, second, third]);
    const attrs = withAttrs(options, {
      href: options.href,
      target: options.target,
      rel: options.rel,
    });
    return this.push('a', [attrs], children);
  }
  /** `<button>` - `type` defaults to `button`; wire it with `on: { click }`. */
  button(text?: ContentText, options?: ButtonOptions, insert?: ContentBuild): this;
  button(text: ContentText, insert: ContentBuild): this;
  button(options: ButtonOptions, insert?: ContentBuild): this;
  button(
    first?: ContentText | ButtonOptions,
    second?: ButtonOptions | ContentBuild,
    third?: ContentBuild,
  ): this {
    const { children, options } = classify<ButtonOptions>([first, second, third]);
    const attrs = withAttrs(options, { type: options.type ?? 'button' });
    return this.push('button', [attrs], children);
  }
  /** `<img>` - `alt` is optional but writing `alt: ''` for decoration is not. */
  img(options: ImageOptions): this {
    return this.push('img', [withAttrs(options, { src: options.src, alt: options.alt })]);
  }

  /** Hands the accumulated tree to the parent; internal to the builders. */
  drain(): ContentChild[] {
    return this.children;
  }

  // One place where a tag becomes a node: sort the arguments out, then normalize
  // options into getters and recurse into the nested build.
  // `presetChildren` is for a tag with named options of its own (`a`, `button`):
  // it has already resolved its arguments once to fold `href`/`type` into `attrs`,
  // and running the author's build a second time here would repeat its side effects.
  private push(tag: ContentTag, args: TagArgs, presetChildren?: ContentChild[]): this {
    const { children, options } = classify<ContentOptions>(args as readonly unknown[]);

    const node: MutableTag = {
      kind: 'tag',
      tag,
      attrs: [],
      listeners: [],
      children: presetChildren ?? children,
    };
    if (options.className !== undefined) node.className = options.className;
    for (const [name, value] of Object.entries(options.attrs ?? {})) {
      node.attrs.push({ name, value });
    }
    for (const [event, handler] of Object.entries(options.on ?? {})) {
      node.listeners.push({ event, handler });
    }
    if (options.visibleWhen) node.visibleWhen = options.visibleWhen;

    this.children.push(node);
    this.last = node;
    return this;
  }
}

// Where `insert`/`continue` splice into a tag: after its children by default, or
// at `at`, clamped so an out-of-range index lands at an end instead of throwing.
function spliceIndex(target: MutableTag, at?: number): number {
  const end = target.children.length;
  return at === undefined ? end : Math.max(0, Math.min(at, end));
}

// Sorts a tag method's arguments by shape: an object is options, and the rest are
// content - the first such argument is the tag's own text-or-children, a second is
// children. `childrenFrom` decides which a callback was, so first position accepts
// `p('text')`, `p(() => text())` and `ul((list) => …)` alike.
function classify<O extends ContentOptions>(
  args: readonly unknown[],
): { children: ContentChild[]; options: O } {
  const sources: (ContentBuild | ContentText)[] = [];
  let options: O | undefined;

  for (const arg of args) {
    if (arg === undefined) continue;
    if (isPlainOptions(arg)) {
      options ??= arg as O;
      continue;
    }
    sources.push(arg as ContentBuild | ContentText);
  }

  return {
    children: sources.flatMap((source) => childrenFrom(source)),
    options: options ?? ({} as O),
  };
}

// Merges a tag's own named options (`href`, `src`, `type`, …) into the generic
// `attrs` map. Named options win: they are the documented path, `attrs` is the
// escape hatch for everything they don't cover.
function withAttrs(
  options: ContentOptions,
  named: Readonly<Record<string, Reactive<AttrValue> | undefined>>,
): ContentOptions {
  const attrs: Record<string, Reactive<AttrValue>> = { ...(options.attrs ?? {}) };
  for (const [name, value] of Object.entries(named)) {
    if (value !== undefined) attrs[name] = value;
  }
  return { ...options, attrs };
}

/** Runs a build callback and returns its tree - the one entry point the page and
 *  form-layout builders share. */
export function buildContent(build: ContentBuild): ContentChild[] {
  const content = new ContentBuilder();
  build(content);
  return content.drain();
}
