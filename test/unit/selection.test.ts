import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { analyzeSelection } from '../../src/panel/selection.js';
import { buildLineRangeMap, type LineRange } from '../../src/panel/renderer.js';

/**
 * Helper to create a container with annotated elements and set up
 * a mock selection within it.
 */
function setupDom(html: string) {
  const dom = new JSDOM(`<!DOCTYPE html><div id="container">${html}</div>`);
  const doc = dom.window.document;
  const container = doc.getElementById('container')!;
  return { dom, doc, container, window: dom.window };
}

function createMockLineRanges(): LineRange[] {
  // Simulate line ranges for a simple document:
  // Line 0: heading, Line 2-3: paragraph, Line 5-6: another paragraph
  const container = new JSDOM(`
    <div>
      <h1 data-source-line="0" data-source-line-end="1">Heading</h1>
      <p data-source-line="2" data-source-line-end="4">First paragraph text.</p>
      <p data-source-line="5" data-source-line-end="7">Second paragraph text.</p>
    </div>
  `).window.document.querySelector('div')!;

  return buildLineRangeMap(container);
}

describe('analyzeSelection', () => {
  it('returns null when selection is collapsed', () => {
    const { container } = setupDom('<p data-source-line="0" data-source-line-end="1">Text</p>');

    // Mock a collapsed selection
    const mockSelection = {
      isCollapsed: true,
      rangeCount: 0,
      toString: () => '',
      getRangeAt: () => { throw new Error('no range'); },
    };
    vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as unknown as Selection);

    const result = analyzeSelection(container, [], new Set());
    expect(result).toBeNull();
  });

  it('returns null when no selection exists', () => {
    const { container } = setupDom('<p>Text</p>');
    vi.spyOn(window, 'getSelection').mockReturnValue(null);

    const result = analyzeSelection(container, [], new Set());
    expect(result).toBeNull();
  });

  it('returns null when selection is outside the container', () => {
    const { doc, container } = setupDom('<p data-source-line="0" data-source-line-end="1">Text</p>');

    // Create an element outside the container
    const outside = doc.createElement('p');
    outside.textContent = 'Outside text';
    doc.body.appendChild(outside);

    const range = doc.createRange();
    range.selectNodeContents(outside);

    const mockSelection = {
      isCollapsed: false,
      rangeCount: 1,
      toString: () => 'Outside text',
      getRangeAt: () => range,
    };
    vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as unknown as Selection);

    const lineRanges = buildLineRangeMap(container);
    const result = analyzeSelection(container, lineRanges, new Set([1]));
    expect(result).toBeNull();
  });

  it('returns null when selected text is empty/whitespace', () => {
    const { doc, container } = setupDom('<p data-source-line="0" data-source-line-end="1">  </p>');

    const p = container.querySelector('p')!;
    const range = doc.createRange();
    range.selectNodeContents(p);

    const mockSelection = {
      isCollapsed: false,
      rangeCount: 1,
      toString: () => '  ',
      getRangeAt: () => range,
    };
    vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as unknown as Selection);

    const lineRanges = buildLineRangeMap(container);
    const result = analyzeSelection(container, lineRanges, new Set([1]));
    expect(result).toBeNull();
  });

  it('maps a single-paragraph selection to correct line range', () => {
    const { doc, container } = setupDom(
      '<p data-source-line="2" data-source-line-end="4">Some text here</p>'
    );

    const p = container.querySelector('p')!;
    const range = doc.createRange();
    range.selectNodeContents(p);

    const mockSelection = {
      isCollapsed: false,
      rangeCount: 1,
      toString: () => 'Some text here',
      getRangeAt: () => range,
    };
    vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as unknown as Selection);

    const lineRanges = buildLineRangeMap(container);
    const commentableLines = new Set([3, 4]); // 1-indexed

    const result = analyzeSelection(container, lineRanges, commentableLines);

    expect(result).not.toBeNull();
    expect(result!.startLine).toBe(2); // 0-indexed
    expect(result!.endLine).toBe(3); // data-source-line-end=4, minus 1
    expect(result!.selectedText).toBe('Some text here');
    expect(result!.commentableStartLine).toBe(3);
    expect(result!.commentableEndLine).toBe(4);
  });

  it('identifies non-commentable selections', () => {
    const { doc, container } = setupDom(
      '<p data-source-line="0" data-source-line-end="2">Text</p>'
    );

    const p = container.querySelector('p')!;
    const range = doc.createRange();
    range.selectNodeContents(p);

    const mockSelection = {
      isCollapsed: false,
      rangeCount: 1,
      toString: () => 'Text',
      getRangeAt: () => range,
    };
    vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as unknown as Selection);

    const lineRanges = buildLineRangeMap(container);
    // No commentable lines overlap with this selection (lines 1-2 in 1-indexed)
    const commentableLines = new Set([10, 11]); // far away

    const result = analyzeSelection(container, lineRanges, commentableLines);

    expect(result).not.toBeNull();
    expect(result!.allCommentable).toBe(false);
    expect(result!.commentableStartLine).toBeNull();
    expect(result!.commentableEndLine).toBeNull();
  });

  it('handles multi-element selections', () => {
    const { doc, container } = setupDom(`
      <h1 data-source-line="0" data-source-line-end="1">Heading</h1>
      <p data-source-line="2" data-source-line-end="4">Paragraph</p>
    `);

    const h1 = container.querySelector('h1')!;
    const p = container.querySelector('p')!;
    const range = doc.createRange();
    range.setStartBefore(h1);
    range.setEndAfter(p);

    const mockSelection = {
      isCollapsed: false,
      rangeCount: 1,
      toString: () => 'Heading\nParagraph',
      getRangeAt: () => range,
    };
    vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as unknown as Selection);

    const lineRanges = buildLineRangeMap(container);
    const commentableLines = new Set([1, 2, 3]); // 1-indexed

    const result = analyzeSelection(container, lineRanges, commentableLines);

    expect(result).not.toBeNull();
    expect(result!.startLine).toBe(0);
    expect(result!.endLine).toBe(3); // end of paragraph
    expect(result!.commentableStartLine).toBe(1);
    expect(result!.commentableEndLine).toBe(3);
  });
});
