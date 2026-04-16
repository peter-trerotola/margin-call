import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { JSDOM } from 'jsdom';
import { renderMarkdown, buildLineRangeMap, createRenderer } from '../../src/panel/renderer.js';

function fixture(name: string): string {
  return readFileSync(
    resolve(__dirname, '../fixtures/markdown', name),
    'utf-8'
  );
}

function toDom(html: string): Document {
  return new JSDOM(`<div id="root">${html}</div>`).window.document;
}

describe('renderMarkdown', () => {
  it('renders headings with data-source-line', () => {
    const html = renderMarkdown('# Hello\n\n## World\n');
    const doc = toDom(html);

    const h1 = doc.querySelector('h1');
    expect(h1).not.toBeNull();
    expect(h1!.getAttribute('data-source-line')).toBe('0');

    const h2 = doc.querySelector('h2');
    expect(h2).not.toBeNull();
    expect(h2!.getAttribute('data-source-line')).toBe('2');
  });

  it('renders paragraphs with data-source-line', () => {
    const html = renderMarkdown('First paragraph.\n\nSecond paragraph.\n');
    const doc = toDom(html);

    const paragraphs = doc.querySelectorAll('p');
    expect(paragraphs.length).toBe(2);
    expect(paragraphs[0].getAttribute('data-source-line')).toBe('0');
    expect(paragraphs[1].getAttribute('data-source-line')).toBe('2');
  });

  it('renders code blocks with data-source-line', () => {
    const src = '```js\nconst x = 1;\n```\n';
    const html = renderMarkdown(src);
    const doc = toDom(html);

    // Fenced code blocks render as <pre><code>
    const pre = doc.querySelector('pre');
    // The fence token gets the source line attribute
    expect(pre).not.toBeNull();
    expect(pre!.getAttribute('data-source-line')).toBe('0');
  });

  it('renders blockquotes with data-source-line', () => {
    const html = renderMarkdown('> Quote text\n');
    const doc = toDom(html);

    const bq = doc.querySelector('blockquote');
    expect(bq).not.toBeNull();
    expect(bq!.getAttribute('data-source-line')).toBe('0');
  });

  it('renders lists with data-source-line', () => {
    const html = renderMarkdown('- Item A\n- Item B\n');
    const doc = toDom(html);

    const ul = doc.querySelector('ul');
    expect(ul).not.toBeNull();
    expect(ul!.getAttribute('data-source-line')).toBe('0');

    const items = doc.querySelectorAll('li');
    expect(items.length).toBe(2);
    expect(items[0].getAttribute('data-source-line')).toBe('0');
    expect(items[1].getAttribute('data-source-line')).toBe('1');
  });

  it('renders tables with data-source-line', () => {
    const src = '| A | B |\n|---|---|\n| 1 | 2 |\n';
    const html = renderMarkdown(src);
    const doc = toDom(html);

    const table = doc.querySelector('table');
    expect(table).not.toBeNull();
    expect(table!.getAttribute('data-source-line')).toBe('0');
  });

  it('renders horizontal rules with data-source-line', () => {
    const html = renderMarkdown('Above\n\n---\n\nBelow\n');
    const doc = toDom(html);

    const hr = doc.querySelector('hr');
    expect(hr).not.toBeNull();
    expect(hr!.getAttribute('data-source-line')).toBe('2');
  });

  it('renders the simple.md fixture without errors', () => {
    const src = fixture('simple.md');
    const html = renderMarkdown(src);
    const doc = toDom(html);

    expect(doc.querySelector('h1')).not.toBeNull();
    expect(doc.querySelector('h2')).not.toBeNull();
    expect(doc.querySelectorAll('li').length).toBe(3);
  });

  it('renders the gfm.md fixture', () => {
    const src = fixture('gfm.md');
    const html = renderMarkdown(src);
    const doc = toDom(html);

    expect(doc.querySelector('table')).not.toBeNull();
    // Task list items + strikethrough text are present as list items
    expect(doc.querySelectorAll('li').length).toBeGreaterThanOrEqual(2);
  });

  it('renders the code-blocks.md fixture', () => {
    const src = fixture('code-blocks.md');
    const html = renderMarkdown(src);
    const doc = toDom(html);

    const codeBlocks = doc.querySelectorAll('pre');
    expect(codeBlocks.length).toBe(2);
  });

  it('renders the nested.md fixture', () => {
    const src = fixture('nested.md');
    const html = renderMarkdown(src);
    const doc = toDom(html);

    expect(doc.querySelector('blockquote')).not.toBeNull();
    expect(doc.querySelector('ol')).not.toBeNull();
  });

  it('handles empty input', () => {
    const html = renderMarkdown('');
    expect(html).toBe('');
  });

  it('handles inline-only content', () => {
    const html = renderMarkdown('**bold text**\n');
    const doc = toDom(html);

    // Even inline content gets wrapped in a <p> with source line
    const p = doc.querySelector('p');
    expect(p).not.toBeNull();
    expect(p!.getAttribute('data-source-line')).toBe('0');
  });
});

describe('buildLineRangeMap', () => {
  it('builds ranges from annotated elements', () => {
    const html = renderMarkdown('# Heading\n\nParagraph\n\n## Sub\n');
    const doc = toDom(html);
    const root = doc.getElementById('root')!;

    const ranges = buildLineRangeMap(root);
    expect(ranges.length).toBeGreaterThan(0);

    // Each range should have valid line numbers
    for (const range of ranges) {
      expect(range.startLine).toBeGreaterThanOrEqual(0);
      expect(range.endLine).toBeGreaterThanOrEqual(range.startLine);
    }
  });

  it('returns empty array for content without annotations', () => {
    const doc = toDom('<p>No annotations</p>');
    const root = doc.getElementById('root')!;
    const ranges = buildLineRangeMap(root);
    expect(ranges).toEqual([]);
  });

  it('uses data-source-line-end for accurate end lines', () => {
    const html = renderMarkdown(
      'First line\nstill first paragraph\n\nSecond paragraph\n'
    );
    const doc = toDom(html);
    const root = doc.getElementById('root')!;

    const ranges = buildLineRangeMap(root);
    // First paragraph spans lines 0-1 (map[0]=0, map[1]=2, so endLine = 2-1 = 1)
    expect(ranges[0].startLine).toBe(0);
    expect(ranges[0].endLine).toBe(1);
  });
});

describe('createRenderer', () => {
  it('returns a markdown-it instance', () => {
    const md = createRenderer();
    expect(md).toBeDefined();
    expect(typeof md.render).toBe('function');
  });

  it('passes safe HTML through the raw renderer', () => {
    // The raw renderer (createRenderer) preserves HTML; sanitization
    // happens in renderMarkdown.
    const md = createRenderer();
    const html = md.render('<div class="custom">Content</div>\n');
    expect(html).toContain('custom');
  });

  it('supports linkification', () => {
    const md = createRenderer();
    const html = md.render('Visit https://example.com\n');
    expect(html).toContain('href="https://example.com"');
  });
});

describe('XSS protection (renderMarkdown)', () => {
  it('strips <script> tags from markdown', () => {
    const malicious = 'Hello\n\n<script>window.pwned = true</script>\n';
    const html = renderMarkdown(malicious);
    expect(html).not.toContain('<script');
    expect(html).not.toContain('pwned');
  });

  it('strips inline event handlers', () => {
    const malicious = '<img src="x" onerror="alert(1)">\n';
    const html = renderMarkdown(malicious);
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('alert(1)');
  });

  it('strips javascript: URLs from raw HTML <a href>', () => {
    // Raw HTML in markdown is the real attack vector for javascript: URLs —
    // markdown-it itself already refuses to build links for `javascript:`
    // in markdown link syntax, but a raw <a href="javascript:..."> would
    // slip through without DOMPurify.
    const malicious = '<a href="javascript:alert(1)">click</a>\n';
    const html = renderMarkdown(malicious);
    expect(html).not.toMatch(/href=["']javascript:/i);
  });

  it('strips javascript: URLs from data: URLs in <a href>', () => {
    const malicious = '<a href="data:text/html,<script>alert(1)</script>">click</a>\n';
    const html = renderMarkdown(malicious);
    expect(html).not.toMatch(/href=["']data:text\/html/i);
  });

  it('preserves safe HTML tags like <kbd> and <details>', () => {
    const src = 'Press <kbd>Ctrl</kbd>+<kbd>C</kbd>\n\n<details><summary>More</summary>hidden</details>\n';
    const html = renderMarkdown(src);
    expect(html).toContain('<kbd>');
    expect(html).toContain('<details>');
    expect(html).toContain('<summary>');
  });

  it('preserves data-source-line attributes through sanitization', () => {
    const html = renderMarkdown('# Title\n\nParagraph\n');
    expect(html).toContain('data-source-line');
  });
});
