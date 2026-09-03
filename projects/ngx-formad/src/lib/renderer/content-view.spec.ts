import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiFormConfigBuilder, text } from 'formodel';
import { ContentChild, ContentChildKind, buildContent } from '../builders/content';
import { RuntimeStepper, StepperBuilder } from '../builders/stepper-builder';
import { FormConfig } from '../form-config/form-config';
import { StepperComponent } from '../runtime/stepper.component';
import { ContentView } from './content-view';

// Proves the two things a template-based renderer could not give us: markup that
// nests exactly as authored (a `<li>` is a *direct* child of its `<ul>`, with no
// component host in between), and per-binding reactivity - a getter that changes
// updates one text node, without the tree being rebuilt.

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

const tone = signal('info');
const count = signal(2);
const visible = signal(false);
const clicks = { n: 0 };

@Component({
  imports: [ContentView],
  template: `<ngx-formad-content [children]="tree" />`,
})
class ContentHost {
  readonly tree = buildContent((c) =>
    c
      .div(
        { className: () => `callout ${tone()}`, attrs: { role: 'note', 'aria-live': 'polite' } },
        (d) =>
          d
            .p('We found ')
            .insert((p) => p.strong(() => `${count()} products`))
            .continue(' in your basket'),
      )
      .ul((list) => list.li('On the product page').li('In your order confirmation'))
      .p('See the ')
      .insert((p) => p.a('warranty terms', { href: '/terms' }))
      .continue(' first.')
      .p('Only when asked', { visibleWhen: () => visible() })
      .button('Retry', { on: { click: () => clicks.n++ } }),
  );
}

describe('ContentView', () => {
  let fixture: ComponentFixture<ContentHost>;

  beforeEach(async () => {
    tone.set('info');
    count.set(2);
    visible.set(false);
    clicks.n = 0;
    fixture = TestBed.createComponent(ContentHost);
    await settle(fixture);
  });

  it('draws the authored tags, classes and attributes', () => {
    const callout: HTMLElement = fixture.nativeElement.querySelector('.callout');
    expect(callout).toBeTruthy();
    expect(callout.className).toBe('callout info');
    expect(callout.getAttribute('role')).toBe('note');
    expect(callout.getAttribute('aria-live')).toBe('polite');
    expect(callout.querySelector('p')!.textContent).toBe('We found 2 products in your basket');
    expect(callout.querySelector('strong')!.textContent).toBe('2 products');
  });

  it('nests a list with no wrapper between ul and li', () => {
    const list: HTMLElement = fixture.nativeElement.querySelector('ul');
    const children = Array.from(list.children).map((el) => el.tagName.toLowerCase());
    expect(children).toEqual(['li', 'li']);
    expect(list.children[0].textContent).toBe('On the product page');
  });

  it('puts a link inside a sentence', () => {
    const paragraph: HTMLElement = fixture.nativeElement.querySelectorAll('p')[1];
    expect(paragraph.textContent).toBe('See the warranty terms first.');
    const link = paragraph.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/terms');
  });

  it('follows a getter without rebuilding the tree', async () => {
    const callout: HTMLElement = fixture.nativeElement.querySelector('.callout');
    const paragraph = callout.querySelector('p')!;

    count.set(5);
    tone.set('warn');
    await settle(fixture);

    // The same DOM nodes, new values - the tree was never re-created.
    expect(fixture.nativeElement.querySelector('.callout')).toBe(callout);
    expect(callout.querySelector('p')).toBe(paragraph);
    expect(paragraph.textContent).toBe('We found 5 products in your basket');
    expect(callout.className).toBe('callout warn');
  });

  it('gates a tag with visibleWhen', async () => {
    const gated = () =>
      Array.from(fixture.nativeElement.querySelectorAll('p') as NodeListOf<HTMLElement>).find(
        (p) => p.textContent === 'Only when asked',
      )!;

    expect(gated().hasAttribute('hidden')).toBe(true);

    visible.set(true);
    await settle(fixture);

    expect(gated().hasAttribute('hidden')).toBe(false);
  });

  it('wires listeners', () => {
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.getAttribute('type')).toBe('button');

    button.click();
    expect(clicks.n).toBe(1);
  });
});

// A tree that did not come from the builder - the JSON path - may name anything.
@Component({
  imports: [ContentView],
  template: `<ngx-formad-content [children]="tree" />`,
})
class UnknownTagHost {
  readonly tree: ContentChild[] = [
    { kind: ContentChildKind.Tag, tag: 'script' as 'p', attrs: [], listeners: [], children: [] },
    {
      kind: ContentChildKind.Tag,
      tag: 'p',
      attrs: [],
      listeners: [],
      children: [{ kind: ContentChildKind.Text, value: () => 'drawn' }],
    },
  ];
}

describe('ContentView - unknown tags', () => {
  it('draws nothing for a tag outside the vocabulary', async () => {
    const fixture = TestBed.createComponent(UnknownTagHost);
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('script')).toBeNull();
    expect(fixture.nativeElement.querySelector('p')!.textContent).toBe('drawn');
  });
});

// The same hand-written tree may be missing any of the arrays the builder always
// fills - `children` was guarded, `attrs`/`listeners` have to be too.
@Component({
  imports: [ContentView],
  template: `<ngx-formad-content [children]="tree" />`,
})
class SparseNodeHost {
  readonly tree: ContentChild[] = JSON.parse(
    '[{"kind":"tag","tag":"p","children":[{"kind":"text","value":"bare"}]}]',
  );
}

describe('ContentView - a sparse hand-written node', () => {
  it('draws it instead of throwing', async () => {
    const fixture = TestBed.createComponent(SparseNodeHost);
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('p')!.textContent).toBe('bare');
  });
});

// The page path: `addContent` on a step, drawn by StepPageView in its own slot.
type Only = { v: string };
const onlyForm: FormConfig<Only> = {
  model: () => ({ v: '' }),
  ui: UiFormConfigBuilder.from({ v: '' }).v(text('Field')),
};

@Component({
  imports: [StepperComponent],
  template: `<ngx-formad-stepper [stepper]="stepper" />`,
})
class PageHost {
  readonly stepper: RuntimeStepper =     new StepperBuilder()
      .withState({})
      .createForm('only', onlyForm)
      .createStep((s) =>
        s.createPage({ options: { heading: 'Products' } }, (p) =>
          p
            .addContent((c) => c.p('Fragile items ship in their own box.'), { layout: 'notice' })
            .addForm('only')
            .addContent((c) => c.small('You can add more later.')),
        ),
      )
      .build();
}

describe('StepPageView - content blocks', () => {
  it('draws content above and below the form, in its own slot', async () => {
    const fixture = TestBed.createComponent(PageHost);
    await settle(fixture);

    const slots = fixture.nativeElement.querySelectorAll('.ngx-formad-content');
    expect(slots).toHaveLength(2);
    expect(slots[0].classList.contains('notice')).toBe(true);
    expect(slots[0].querySelector('p').textContent).toBe('Fragile items ship in their own box.');
    expect(slots[1].querySelector('small').textContent).toBe('You can add more later.');
    // The form still renders between them.
    expect(fixture.nativeElement.querySelector('input')).toBeTruthy();
  });
});

// ── What a content tree is NOT allowed to do ────────────────────────────────
// The tag allowlist stops `<script>`; these are the other two ways markup-as-data
// could smuggle in code, so the renderer guards attribute names and URL schemes.
@Component({
  imports: [ContentView],
  template: `<ngx-formad-content [children]="tree" />`,
})
class UnsafeAttrHost {
  readonly tree = buildContent((c) =>
    c
      .div({ attrs: { onclick: 'alert(1)', ONMOUSEOVER: 'alert(2)', 'data-ok': 'yes' } })
      .a('Bad', { href: 'javascript:alert(1)' })
      .a('Good', { href: '/terms' })
      .img({ src: 'data:text/html,<script>alert(1)</script>', alt: '' })
      .span('ok', { attrs: { 'xlink:href': '/x' } }),
  );
}

describe('ContentView - refused attributes', () => {
  let fixture: ComponentFixture<UnsafeAttrHost>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(UnsafeAttrHost);
    await settle(fixture);
  });

  it('drops event-handler attribute names', () => {
    const div: HTMLElement = fixture.nativeElement.querySelector('div');
    expect(div.getAttribute('onclick')).toBeNull();
    expect(div.getAttribute('onmouseover')).toBeNull();
    // Everything else on the same tag still lands.
    expect(div.getAttribute('data-ok')).toBe('yes');
  });

  it('drops a scheme hidden behind interior whitespace', async () => {
    // Browsers strip tabs/newlines/CRs from a URL before resolving its scheme, so
    // this is `javascript:` as far as the click is concerned.
    @Component({
      imports: [ContentView],
      template: `<ngx-formad-content [children]="tree" />`,
    })
    class SplitSchemeHost {
      readonly tree = buildContent((c) =>
        c
          .a('Bad', { href: 'java\nscript:alert(1)' })
          .a('Also bad', { href: 'JAVA\tSCRIPT:alert(1)' }),
      );
    }

    const split = TestBed.createComponent(SplitSchemeHost);
    await settle(split);

    const links = split.nativeElement.querySelectorAll('a') as NodeListOf<HTMLAnchorElement>;
    expect(links[0].getAttribute('href')).toBeNull();
    expect(links[1].getAttribute('href')).toBeNull();
  });

  it('drops a URL attribute with an unsafe scheme, keeps a safe one', () => {
    const links = fixture.nativeElement.querySelectorAll('a') as NodeListOf<HTMLAnchorElement>;
    expect(links[0].getAttribute('href')).toBeNull();
    expect(links[0].textContent).toBe('Bad');
    expect(links[1].getAttribute('href')).toBe('/terms');
    expect(fixture.nativeElement.querySelector('img')!.getAttribute('src')).toBeNull();
    expect(fixture.nativeElement.querySelector('span')!.getAttribute('xlink:href')).toBe('/x');
  });
});

// ── Boolean vs enumerated attributes ────────────────────────────────────────
@Component({
  imports: [ContentView],
  template: `<ngx-formad-content [children]="tree" />`,
})
class AttrValueHost {
  readonly tree = buildContent((c) =>
    c
      .span('icon', { attrs: { 'aria-hidden': true } })
      .p('Expanded', { attrs: { 'aria-expanded': false } })
      .button('Off', { attrs: { disabled: true } })
      .button('On', { attrs: { disabled: false } })
      .p('Gone', { attrs: { hidden: true } }),
  );
}

describe('ContentView - attribute values', () => {
  let fixture: ComponentFixture<AttrValueHost>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(AttrValueHost);
    await settle(fixture);
  });

  it('writes ARIA booleans as words, since an empty value reads as unset', () => {
    expect(fixture.nativeElement.querySelector('span')!.getAttribute('aria-hidden')).toBe('true');
    const paragraphs = fixture.nativeElement.querySelectorAll('p') as NodeListOf<HTMLElement>;
    expect(paragraphs[0].getAttribute('aria-expanded')).toBe('false');
  });

  it('writes true HTML booleans as presence/absence', () => {
    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLElement>;
    expect(buttons[0].getAttribute('disabled')).toBe('');
    expect(buttons[1].hasAttribute('disabled')).toBe(false);
    const paragraphs = fixture.nativeElement.querySelectorAll('p') as NodeListOf<HTMLElement>;
    expect(paragraphs[1].getAttribute('hidden')).toBe('');
  });
});

// ── The first paint is already correct ──────────────────────────────────────
@Component({
  imports: [ContentView],
  template: `<ngx-formad-content [children]="tree" />`,
})
class FirstPaintHost {
  readonly tree = buildContent((c) =>
    c.p(() => 'live text').p('gated', { visibleWhen: () => false, className: 'flex-row' }),
  );
}

describe('ContentView - first paint', () => {
  it('writes getters and gates before the first frame is done', () => {
    const fixture = TestBed.createComponent(FirstPaintHost);
    // One pass only: a binding applied lazily (by its effect alone) would show an
    // empty paragraph here, and the gated one would flash visible.
    fixture.detectChanges();

    const paragraphs = fixture.nativeElement.querySelectorAll('p') as NodeListOf<HTMLElement>;
    expect(paragraphs[0].textContent).toBe('live text');
    expect(paragraphs[1].hasAttribute('hidden')).toBe(true);
    // `hidden` alone loses to any author `display` rule, so the gate writes both.
    expect(paragraphs[1].style.display).toBe('none');
  });
});

// ── A swapped tree ──────────────────────────────────────────────────────────
@Component({
  imports: [ContentView],
  template: `<ngx-formad-content [children]="tree()" />`,
})
class SwappedHost {
  readonly tree = signal(buildContent((c) => c.h3('Your name')));
}

describe('ContentView - a changed tree', () => {
  it('repaints when the children input changes', async () => {
    const fixture = TestBed.createComponent(SwappedHost);
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('h3')!.textContent).toBe('Your name');

    // What happens when a host swaps one form for another whose content node
    // tracks to the same key: the same view instance, a different tree.
    fixture.componentInstance.tree.set(buildContent((c) => c.h3('Company details')));
    await settle(fixture);

    const headings = fixture.nativeElement.querySelectorAll('h3') as NodeListOf<HTMLElement>;
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe('Company details');
  });
});
