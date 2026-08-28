import { signal } from '@angular/core';
import { ContentChild, ContentTagChild, buildContent, isContentTag } from './content';

// The builder's whole job is to turn method calls into the node tree the renderer
// draws, with every dynamic value normalized to a getter. These tests read the
// tree directly - no DOM - so a change in the renderer can never make them pass
// for the wrong reason.

function tagAt(children: readonly ContentChild[], index = 0): ContentTagChild {
  const child = children[index];
  if (child.kind !== 'tag') throw new Error(`child ${index} is not a tag`);
  return child;
}

// A node keeps its value exactly as authored - a string stays a string, a getter
// stays a getter - so a test reads it the way the renderer does.
function read<V>(source: V | (() => V)): V {
  return typeof source === 'function' ? (source as () => V)() : source;
}

function textOf(child: ContentChild): string {
  if (child.kind !== 'text') throw new Error('not a text child');
  return String(read(child.value));
}

describe('ContentBuilder', () => {
  it('emits tags in call order, each holding its text', () => {
    const tree = buildContent((c) => c.h3('Contact').p('Who should we call?'));

    expect(tree.map((child) => tagAt([child]).tag)).toEqual(['h3', 'p']);
    expect(textOf(tagAt(tree, 0).children[0])).toBe('Contact');
    expect(textOf(tagAt(tree, 1).children[0])).toBe('Who should we call?');
  });

  it('accepts a container as (options, insert)', () => {
    const tree = buildContent((c) =>
      c.p('A line', { className: 'hint' }).div({ className: 'callout' }, (d) => d.span('Inside')),
    );

    expect(read(tagAt(tree, 0).className)).toBe('hint');
    const callout = tagAt(tree, 1);
    expect(read(callout.className)).toBe('callout');
    expect(tagAt(callout.children).tag).toBe('span');
  });

  it('takes a text getter in first position, children in the last', () => {
    const line = signal('live');
    const tree = buildContent((c) =>
      c.p(() => line()).p('Signed, ', { className: 'sig' }, (p) => p.strong('COMPANY')),
    );

    expect(textOf(tagAt(tree, 0).children[0])).toBe('live');
    line.set('changed');
    expect(textOf(tagAt(tree, 0).children[0])).toBe('changed');

    const signed = tagAt(tree, 1);
    expect(read(signed.className)).toBe('sig');
    expect(textOf(signed.children[0])).toBe('Signed, ');
    expect(tagAt(signed.children, 1).tag).toBe('strong');
  });

  it('nests children inside the tag added before it, keeping the cursor there', () => {
    const tree = buildContent((c) =>
      c
        .p('We found ')
        .insert((p) => p.strong('2 products'))
        .continue(' in your basket.'),
    );

    // One paragraph - `insert` and `continue` wrote into it, not beside it.
    expect(tree).toHaveLength(1);
    const paragraph = tagAt(tree);
    expect(textOf(paragraph.children[0])).toBe('We found ');
    expect(tagAt(paragraph.children, 1).tag).toBe('strong');
    expect(textOf(paragraph.children[2])).toBe(' in your basket.');
  });

  it('keeps the cursor on that tag across several inserts', () => {
    const tree = buildContent((c) =>
      c
        .p('Read ')
        .insert((p) => p.a('the terms', { href: '/terms' }))
        .continue(' and ')
        .insert((p) => p.a('the privacy notice', { href: '/privacy' }))
        .continue('.'),
    );

    expect(tree).toHaveLength(1);
    const kinds = tagAt(tree).children.map((child) => (child.kind === 'tag' ? child.tag : 'text'));
    expect(kinds).toEqual(['text', 'a', 'text', 'a', 'text']);
  });

  it('inserts at a position inside that tag', () => {
    const tree = buildContent((c) =>
      c
        .p('handles it')
        .insert((p) => p.strong('COMPANY '), 0)
        .continue('At ', 0),
    );

    const paragraph = tagAt(tree);
    expect(paragraph.children).toHaveLength(3);
    expect(textOf(paragraph.children[0])).toBe('At ');
    expect(tagAt(paragraph.children, 1).tag).toBe('strong');
    expect(textOf(paragraph.children[2])).toBe('handles it');
  });

  it('degrades a stray insert or continue to this level', () => {
    const tree = buildContent((c) => c.insert((i) => i.span('orphan')).continue('loose'));

    expect(tagAt(tree, 0).tag).toBe('span');
    expect(textOf(tree[1])).toBe('loose');
  });

  it('writes into the innermost tag when inserts nest', () => {
    const tree = buildContent((c) =>
      c.p('outer ').insert((p) => p.span('inner ').insert((span) => span.strong('deep'))),
    );

    const span = tagAt(tagAt(tree).children, 1);
    expect(span.tag).toBe('span');
    expect(tagAt(span.children, 1).tag).toBe('strong');
  });

  it('keeps classes and attributes reactive', () => {
    const tone = signal('info');
    const tree = buildContent((c) =>
      c.div({ className: () => `callout ${tone()}`, attrs: { 'aria-live': 'polite' } }),
    );

    const block = tagAt(tree);
    expect(read(block.className)).toBe('callout info');
    // A constant attribute stays a constant on the node - nothing to subscribe to.
    expect(block.attrs).toEqual([{ name: 'aria-live', value: 'polite' }]);

    tone.set('warn');
    expect(read(block.className)).toBe('callout warn');
  });

  it('maps a tag its own named options onto attributes', () => {
    const tree = buildContent((c) =>
      c
        .a('Terms', { href: '/terms', target: '_blank' }, (a) => a.span('open_in_new'))
        .button('Retry', { on: { click: () => undefined } })
        .img({ src: '/plate.png', alt: '' }),
    );

    const attrs = (node: ContentTagChild) =>
      Object.fromEntries(node.attrs.map((attr) => [attr.name, read(attr.value)]));

    expect(attrs(tagAt(tree, 0))).toEqual({ href: '/terms', target: '_blank' });
    // Text and nested children coexist: the icon sits inside the link.
    expect(tagAt(tagAt(tree, 0).children, 1).tag).toBe('span');
    // A content button never submits by accident.
    expect(attrs(tagAt(tree, 1))).toEqual({ type: 'button' });
    expect(tagAt(tree, 1).listeners.map((l) => l.event)).toEqual(['click']);
    expect(attrs(tagAt(tree, 2))).toEqual({ src: '/plate.png', alt: '' });
  });

  it('keeps a callback that only returns text as reactive text', () => {
    const count = signal(2);
    // `() => …` is both a text getter and a build callback as far as TS can tell;
    // this one added nothing and returned a string, so it was text.
    const tree = buildContent((c) => c.p('We found ').insert(() => `${count()} products`));

    const paragraph = tagAt(tree);
    expect(paragraph.children).toHaveLength(2);
    expect(textOf(paragraph.children[1])).toBe('2 products');

    count.set(7);
    expect(textOf(paragraph.children[1])).toBe('7 products');
  });

  it('leaves the cursor on a tag that nested children inline', () => {
    const tree = buildContent((c) =>
      c.a('Kliknij', { href: '/x' }, (a) => a.span('open_in_new')).continue(', proszę'),
    );

    const link = tagAt(tree);
    expect(link.tag).toBe('a');
    expect(textOf(link.children[0])).toBe('Kliknij');
    expect(tagAt(link.children, 1).tag).toBe('span');
    expect(textOf(link.children[2])).toBe(', proszę');
  });

  it('closes the tag vocabulary', () => {
    expect(isContentTag('p')).toBe(true);
    expect(isContentTag('script')).toBe(false);
    expect(isContentTag('iframe')).toBe(false);
  });
});
