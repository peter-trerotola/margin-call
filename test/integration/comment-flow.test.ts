import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderMarkdown, buildLineRangeMap } from '../../src/panel/renderer.js';
import { parseDiff } from '../../src/panel/diff-parser.js';
import { analyzeSelection } from '../../src/panel/selection.js';
import { formatCommentBody, groupCommentsIntoThreads } from '../../src/panel/comments.js';
import { setStorageData } from '../mocks/chrome.js';

describe('comment flow integration', () => {
  it('renders markdown → parses diff → maps selection → validates commentable', () => {
    // 1. Render markdown with source line annotations
    const markdown = '# Title\n\nFirst paragraph.\n\nSecond paragraph.\n';
    const html = renderMarkdown(markdown);

    const dom = new JSDOM(`<div id="content">${html}</div>`);
    const container = dom.window.document.getElementById('content')!;

    // 2. Build line range map
    const lineRanges = buildLineRangeMap(container);
    expect(lineRanges.length).toBeGreaterThan(0);

    // 3. Parse diff to get commentable lines (simulate new file)
    const patch = '@@ -0,0 +1,5 @@\n+# Title\n+\n+First paragraph.\n+\n+Second paragraph.\n';
    const diffResult = parseDiff(patch);
    expect(diffResult.commentableLines.size).toBe(5);

    // 4. Simulate selection on the first paragraph
    const firstP = container.querySelector('p')!;
    const range = dom.window.document.createRange();
    range.selectNodeContents(firstP);

    const mockSelection = {
      isCollapsed: false,
      rangeCount: 1,
      toString: () => 'First paragraph.',
      getRangeAt: () => range,
    };
    vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as unknown as Selection);

    // 5. Analyze selection
    const selResult = analyzeSelection(
      container,
      lineRanges,
      diffResult.commentableLines
    );

    expect(selResult).not.toBeNull();
    expect(selResult!.selectedText).toBe('First paragraph.');
    expect(selResult!.commentableStartLine).not.toBeNull();
    expect(selResult!.commentableEndLine).not.toBeNull();
  });

  it('detects non-commentable selections on unchanged lines', () => {
    const markdown = '# Title\n\nFirst paragraph.\n\nSecond paragraph.\n';
    const html = renderMarkdown(markdown);

    const dom = new JSDOM(`<div id="content">${html}</div>`);
    const container = dom.window.document.getElementById('content')!;
    const lineRanges = buildLineRangeMap(container);

    // Only line 3 is changed (Second paragraph)
    const patch = '@@ -4,1 +4,1 @@\n-Old second.\n+Second paragraph.';
    const diffResult = parseDiff(patch);

    // Select the first paragraph (lines 2-3 in 0-indexed), which is NOT in the diff
    const firstP = container.querySelector('p')!;
    const range = dom.window.document.createRange();
    range.selectNodeContents(firstP);

    const mockSelection = {
      isCollapsed: false,
      rangeCount: 1,
      toString: () => 'First paragraph.',
      getRangeAt: () => range,
    };
    vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as unknown as Selection);

    const selResult = analyzeSelection(
      container,
      lineRanges,
      diffResult.commentableLines
    );

    expect(selResult).not.toBeNull();
    expect(selResult!.commentableStartLine).toBeNull();
    expect(selResult!.allCommentable).toBe(false);
  });

  it('formats comment body with blockquote of selected text', () => {
    const body = formatCommentBody(
      'This needs more detail.',
      'First paragraph.'
    );
    expect(body).toBe('> First paragraph.\n\nThis needs more detail.');
  });

  it('formats multi-line selected text as blockquote', () => {
    const body = formatCommentBody(
      'Please elaborate.',
      'Line one\nLine two\nLine three'
    );
    expect(body).toContain('> Line one');
    expect(body).toContain('> Line two');
    expect(body).toContain('> Line three');
    expect(body).toContain('Please elaborate.');
  });
});

describe('comment threading', () => {
  it('groups replies under root comments', () => {
    const comments = [
      {
        id: 1,
        body: 'Root comment',
        line: 5,
        start_line: null,
        path: 'doc.md',
        user: { login: 'a', avatar_url: '' },
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 2,
        body: 'Reply to root',
        line: 5,
        start_line: null,
        path: 'doc.md',
        user: { login: 'b', avatar_url: '' },
        created_at: '2026-01-01T01:00:00Z',
        in_reply_to_id: 1,
      },
      {
        id: 3,
        body: 'Another root',
        line: 10,
        start_line: null,
        path: 'doc.md',
        user: { login: 'c', avatar_url: '' },
        created_at: '2026-01-01T02:00:00Z',
      },
    ];

    const threads = groupCommentsIntoThreads(comments);

    expect(threads.length).toBe(2);
    expect(threads[0].root.id).toBe(1);
    expect(threads[0].replies.length).toBe(1);
    expect(threads[0].replies[0].id).toBe(2);
    expect(threads[1].root.id).toBe(3);
    expect(threads[1].replies.length).toBe(0);
  });

  it('handles empty comment list', () => {
    const threads = groupCommentsIntoThreads([]);
    expect(threads.length).toBe(0);
  });

  it('sorts replies by created_at', () => {
    const comments = [
      {
        id: 1,
        body: 'Root',
        line: 1,
        start_line: null,
        path: 'doc.md',
        user: { login: 'a', avatar_url: '' },
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 3,
        body: 'Later reply',
        line: 1,
        start_line: null,
        path: 'doc.md',
        user: { login: 'c', avatar_url: '' },
        created_at: '2026-01-01T03:00:00Z',
        in_reply_to_id: 1,
      },
      {
        id: 2,
        body: 'Earlier reply',
        line: 1,
        start_line: null,
        path: 'doc.md',
        user: { login: 'b', avatar_url: '' },
        created_at: '2026-01-01T01:00:00Z',
        in_reply_to_id: 1,
      },
    ];

    const threads = groupCommentsIntoThreads(comments);
    expect(threads[0].replies[0].id).toBe(2); // Earlier first
    expect(threads[0].replies[1].id).toBe(3); // Later second
  });
});
