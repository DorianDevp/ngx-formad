import { Reactive } from './dynamic-component';

/** The tags a content block may draw: structure, text, lists, links, images, a button. */
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

/** One of the drawable content tags. */
export type ContentTag = (typeof CONTENT_TAGS)[number];

/** Narrows a tag name to a drawable content tag; the renderer's guard against trees that did not come from the builder. */
export function isContentTag(tag: string): tag is ContentTag {
  return (CONTENT_TAGS as readonly string[]).includes(tag);
}

/** What an attribute may hold; `null`/`undefined`/`false` remove it, `true` writes it empty. */
export type AttrValue = string | number | boolean | null | undefined;

/** Text a content node draws: a value, or a getter for text that changes. */
export type ContentText = Reactive<string | number>;

/** Attributes, listeners and visibility any content tag accepts. */
export interface ContentOptions {
  readonly className?: Reactive<string>;

  readonly attrs?: Readonly<Record<string, Reactive<AttrValue>>>;

  readonly on?: Readonly<Record<string, (event: Event) => void>>;

  readonly visibleWhen?: () => boolean;
}

/** Anchor options: `href`, `target` and `rel` on top of the common ones. */
export interface AnchorOptions extends ContentOptions {
  readonly href?: Reactive<string>;

  readonly target?: Reactive<string>;

  readonly rel?: Reactive<string>;
}

/** Image options: a required `src` and an `alt`. */
export interface ImageOptions extends ContentOptions {
  readonly src: Reactive<string>;

  readonly alt?: Reactive<string>;
}

/** Button options; `type` defaults to `button` so a button in prose never submits by accident. */
export interface ButtonOptions extends ContentOptions {
  readonly type?: 'button' | 'submit' | 'reset';
}

/** One attribute as authored: its name and its value or getter. */
export interface ContentAttr {
  readonly name: string;

  readonly value: Reactive<AttrValue>;
}

/** One DOM listener: the event name and its handler. */
export interface ContentListener {
  readonly event: string;

  readonly handler: (event: Event) => void;
}

/** Discriminates the two kinds of content child. */
export enum ContentChildKind {
  Text = 'text',
  Tag = 'tag',
}

/** A text run inside a tag or at the top level of a block. */
export interface ContentTextChild {
  readonly kind: ContentChildKind.Text;

  readonly value: ContentText;
}

/** One element: its tag, attributes, listeners, visibility gate and children. */
export interface ContentTagChild {
  readonly kind: ContentChildKind.Tag;

  readonly tag: ContentTag;

  readonly className?: Reactive<string>;

  readonly attrs: readonly ContentAttr[];

  readonly listeners: readonly ContentListener[];

  readonly visibleWhen?: () => boolean;

  readonly children: readonly ContentChild[];
}

/** Anything a content block holds. */
export type ContentChild = ContentTextChild | ContentTagChild;

/** A nested build: whatever it adds to the builder becomes the children of the tag it was given to. */
export type ContentBuild = (content: ContentBuilder) => ContentBuilder | ContentText | void;

/** The argument shapes a tag method accepts: text, options and nested children, in any sensible subset. */
export type TagArgsOf<O extends ContentOptions> =
  | [text?: ContentText, options?: O, insert?: ContentBuild]
  | [text: ContentText, insert: ContentBuild]
  | [options: O, insert?: ContentBuild]
  | [insert: ContentBuild];

/** The argument shapes of a tag with only the common options. */
export type TagArgs = TagArgsOf<ContentOptions>;

interface MutableTag {
  kind: ContentChildKind.Tag;
  tag: ContentTag;
  className?: Reactive<string>;
  attrs: ContentAttr[];
  listeners: ContentListener[];
  visibleWhen?: () => boolean;
  children: ContentChild[];
}

interface TagParts<O extends ContentOptions> {
  readonly children: ContentChild[];
  readonly options?: O;
}

type TagArg<O extends ContentOptions> = ContentText | O | ContentBuild;

function isOptions<O extends ContentOptions>(arg: TagArg<O>): arg is O {
  return typeof arg === 'object';
}

function childrenFrom(source: ContentBuild | ContentText): ContentChild[] {
  if (typeof source !== 'function') return [{ kind: ContentChildKind.Text, value: source }];

  const nested = new ContentBuilder();
  const returned = source(nested);
  const nodes = nested.drain();
  if (nodes.length) return nodes;

  return typeof returned === 'string' || typeof returned === 'number'
    ? [{ kind: ContentChildKind.Text, value: source as ContentText }]
    : nodes;
}

function classify<O extends ContentOptions>(args: TagArgsOf<O>): TagParts<O> {
  const given: readonly (TagArg<O> | undefined)[] = args;
  const present = given.filter((arg): arg is TagArg<O> => arg !== undefined);
  const options = present.find((arg): arg is O => isOptions(arg));
  const sources = present.filter((arg): arg is ContentText | ContentBuild => !isOptions(arg));

  return { children: sources.flatMap((source) => childrenFrom(source)), options };
}

function withAttrs(
  options: ContentOptions | undefined,
  named: Readonly<Record<string, Reactive<AttrValue>>>,
): ContentOptions {
  const declared = Object.entries(named).filter(([, value]) => value !== undefined);

  return { ...options, attrs: { ...options?.attrs, ...Object.fromEntries(declared) } };
}

function spliceIndex(target: MutableTag, at?: number): number {
  const end = target.children.length;

  return at === undefined ? end : Math.max(0, Math.min(at, end));
}

/** Builds the markup of one content block; every tag method appends at this level and chains. */
export class ContentBuilder {
  private children: ContentChild[] = [];

  private last: MutableTag | null = null;

  text(value: ContentText): this {
    this.children = [...this.children, { kind: ContentChildKind.Text, value }];
    this.last = null;

    return this;
  }

  insert(build: ContentBuild | ContentText, at?: number): this {
    const nodes = childrenFrom(build);
    const target = this.last;
    if (!target) {
      this.children = [...this.children, ...nodes];

      return this;
    }

    target.children.splice(spliceIndex(target, at), 0, ...nodes);

    return this;
  }

  continue(value: ContentText, at?: number): this {
    const child: ContentTextChild = { kind: ContentChildKind.Text, value };
    const target = this.last;
    if (!target) {
      this.children = [...this.children, child];

      return this;
    }

    target.children.splice(spliceIndex(target, at), 0, child);

    return this;
  }

  div(...args: TagArgs): this {
    return this.push('div', classify(args));
  }

  section(...args: TagArgs): this {
    return this.push('section', classify(args));
  }

  p(...args: TagArgs): this {
    return this.push('p', classify(args));
  }

  h1(...args: TagArgs): this {
    return this.push('h1', classify(args));
  }

  h2(...args: TagArgs): this {
    return this.push('h2', classify(args));
  }

  h3(...args: TagArgs): this {
    return this.push('h3', classify(args));
  }

  h4(...args: TagArgs): this {
    return this.push('h4', classify(args));
  }

  h5(...args: TagArgs): this {
    return this.push('h5', classify(args));
  }

  h6(...args: TagArgs): this {
    return this.push('h6', classify(args));
  }

  ul(...args: TagArgs): this {
    return this.push('ul', classify(args));
  }

  ol(...args: TagArgs): this {
    return this.push('ol', classify(args));
  }

  li(...args: TagArgs): this {
    return this.push('li', classify(args));
  }

  dl(...args: TagArgs): this {
    return this.push('dl', classify(args));
  }

  dt(...args: TagArgs): this {
    return this.push('dt', classify(args));
  }

  dd(...args: TagArgs): this {
    return this.push('dd', classify(args));
  }

  blockquote(...args: TagArgs): this {
    return this.push('blockquote', classify(args));
  }

  figure(...args: TagArgs): this {
    return this.push('figure', classify(args));
  }

  figcaption(...args: TagArgs): this {
    return this.push('figcaption', classify(args));
  }

  pre(...args: TagArgs): this {
    return this.push('pre', classify(args));
  }

  span(...args: TagArgs): this {
    return this.push('span', classify(args));
  }

  strong(...args: TagArgs): this {
    return this.push('strong', classify(args));
  }

  em(...args: TagArgs): this {
    return this.push('em', classify(args));
  }

  small(...args: TagArgs): this {
    return this.push('small', classify(args));
  }

  code(...args: TagArgs): this {
    return this.push('code', classify(args));
  }

  hr(options: ContentOptions = {}): this {
    return this.push('hr', { children: [], options });
  }

  br(options: ContentOptions = {}): this {
    return this.push('br', { children: [], options });
  }

  a(...args: TagArgsOf<AnchorOptions>): this {
    const parts = classify(args);
    const named = { href: parts.options?.href, target: parts.options?.target, rel: parts.options?.rel };

    return this.push('a', { children: parts.children, options: withAttrs(parts.options, named) });
  }

  button(...args: TagArgsOf<ButtonOptions>): this {
    const parts = classify(args);
    const named = { type: parts.options?.type ?? 'button' };

    return this.push('button', { children: parts.children, options: withAttrs(parts.options, named) });
  }

  img(options: ImageOptions): this {
    const named = { src: options.src, alt: options.alt };

    return this.push('img', { children: [], options: withAttrs(options, named) });
  }

  drain(): ContentChild[] {
    return this.children;
  }

  private push(tag: ContentTag, parts: TagParts<ContentOptions>): this {
    const options = parts.options ?? {};
    const node: MutableTag = {
      kind: ContentChildKind.Tag,
      tag,
      className: options.className,
      attrs: Object.entries(options.attrs ?? {}).map(([name, value]) => ({ name, value })),
      listeners: Object.entries(options.on ?? {}).map(([event, handler]) => ({ event, handler })),
      visibleWhen: options.visibleWhen,
      children: parts.children,
    };

    this.children = [...this.children, node];
    this.last = node;

    return this;
  }
}

/** Runs a build callback and returns the tree it authored. */
export function buildContent(build: ContentBuild): ContentChild[] {
  const content = new ContentBuilder();
  build(content);

  return content.drain();
}
