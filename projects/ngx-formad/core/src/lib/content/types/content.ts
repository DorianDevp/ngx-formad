import { Signal } from '@angular/core';

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

/** What an attribute may hold; `null`/`undefined`/`false` remove it, `true` writes it empty. */
export type AttrValue = string | number | boolean | null | undefined;

/** Text a content node draws: a value, or a getter for text that changes. */
export type ContentText = string | number | Signal<string | number>;

/** Attributes, listeners and visibility any content tag accepts. */
export interface ContentOptions {
  readonly className?: string | Signal<string>;

  readonly attrs?: Readonly<Record<string, AttrValue | Signal<AttrValue>>>;

  readonly on?: Readonly<Record<string, (event: Event) => void>>;

  readonly visibleWhen?: () => boolean;
}

/** Anchor options: `href`, `target` and `rel` on top of the common ones. */
export interface AnchorOptions extends ContentOptions {
  readonly href?: string | Signal<string>;

  readonly target?: string | Signal<string>;

  readonly rel?: string | Signal<string>;
}

/** Image options: a required `src` and an `alt`. */
export interface ImageOptions extends ContentOptions {
  readonly src: string | Signal<string>;

  readonly alt?: string | Signal<string>;
}

/** Button options; `type` defaults to `button` so a button in prose never submits by accident. */
export interface ButtonOptions extends ContentOptions {
  readonly type?: 'button' | 'submit' | 'reset';
}

/** One attribute as authored: its name and its value or getter. */
export interface ContentAttr {
  readonly name: string;

  readonly value: AttrValue | Signal<AttrValue>;
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

  readonly className?: string | Signal<string>;

  readonly attrs: readonly ContentAttr[];

  readonly listeners: readonly ContentListener[];

  readonly visibleWhen?: () => boolean;

  readonly children: readonly ContentChild[];
}

/** Anything a content block holds. */
export type ContentChild = ContentTextChild | ContentTagChild;
