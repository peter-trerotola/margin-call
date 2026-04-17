import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  groupCommentsIntoThreads,
  partitionThreadsByLevel,
  mapThreadsToElements,
  formatCommentBody,
  renderCommentCard,
  renderThread,
} from '../../src/panel/comments.js';
import { buildLineRangeMap, renderMarkdown } from '../../src/panel/renderer.js';
import type { ReviewComment } from '../../src/panel/github-api.js';

function makeComment(overrides: Partial<ReviewComment> & { id: number }): ReviewComment {
  return {
    body: 'test',
    line: 1,
    start_line: null,
    path: 'doc.md',
    user: { login: 'user', avatar_url: 'https://example.com/avatar.png' },
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('groupCommentsIntoThreads', () => {
  it('groups a single root with no replies', () => {
    const threads = groupCommentsIntoThreads([makeComment({ id: 1 })]);
    expect(threads).toHaveLength(1);
    expect(threads[0].root.id).toBe(1);
    expect(threads[0].replies).toHaveLength(0);
  });

  it('groups replies under their root', () => {
    const threads = groupCommentsIntoThreads([
      makeComment({ id: 1, body: 'root' }),
      makeComment({ id: 2, body: 'reply', in_reply_to_id: 1 }),
      makeComment({ id: 3, body: 'reply2', in_reply_to_id: 1 }),
    ]);
    expect(threads).toHaveLength(1);
    expect(threads[0].replies).toHaveLength(2);
  });

  it('sorts replies by created_at ascending', () => {
    const threads = groupCommentsIntoThreads([
      makeComment({ id: 1 }),
      makeComment({ id: 3, created_at: '2026-01-03T00:00:00Z', in_reply_to_id: 1 }),
      makeComment({ id: 2, created_at: '2026-01-02T00:00:00Z', in_reply_to_id: 1 }),
    ]);
    expect(threads[0].replies[0].id).toBe(2);
    expect(threads[0].replies[1].id).toBe(3);
  });

  it('handles multiple independent threads', () => {
    const threads = groupCommentsIntoThreads([
      makeComment({ id: 1, line: 5 }),
      makeComment({ id: 2, line: 10 }),
      makeComment({ id: 3, in_reply_to_id: 1 }),
    ]);
    expect(threads).toHaveLength(2);
    expect(threads[0].replies).toHaveLength(1);
    expect(threads[1].replies).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(groupCommentsIntoThreads([])).toEqual([]);
  });
});

describe('partitionThreadsByLevel', () => {
  it('separates file-level from line-level threads', () => {
    const threads = groupCommentsIntoThreads([
      makeComment({ id: 1, line: 5 }),
      makeComment({ id: 2, line: null }),
    ]);
    const { fileLevel, lineLevel } = partitionThreadsByLevel(threads);
    expect(lineLevel).toHaveLength(1);
    expect(lineLevel[0].root.id).toBe(1);
    expect(fileLevel).toHaveLength(1);
    expect(fileLevel[0].root.id).toBe(2);
  });

  it('returns empty partitions for empty input', () => {
    const result = partitionThreadsByLevel([]);
    expect(result.fileLevel).toEqual([]);
    expect(result.lineLevel).toEqual([]);
  });
});

describe('mapThreadsToElements', () => {
  function buildRanges(markdown: string) {
    const html = renderMarkdown(markdown);
    const dom = new JSDOM(`<div id="r">${html}</div>`);
    return buildLineRangeMap(dom.window.document.getElementById('r')!);
  }

  it('maps a thread to the element containing its line', () => {
    const ranges = buildRanges('# Title\n\nParagraph\n');
    const threads = groupCommentsIntoThreads([
      makeComment({ id: 1, line: 1 }),
    ]);
    const map = mapThreadsToElements(threads, ranges);
    expect(map.size).toBe(1);
  });

  it('skips file-level threads (line=null)', () => {
    const ranges = buildRanges('# Title\n');
    const threads = groupCommentsIntoThreads([
      makeComment({ id: 1, line: null }),
    ]);
    const map = mapThreadsToElements(threads, ranges);
    expect(map.size).toBe(0);
  });

  it('skips threads on lines beyond the rendered content', () => {
    const ranges = buildRanges('Short\n');
    const threads = groupCommentsIntoThreads([
      makeComment({ id: 1, line: 999 }),
    ]);
    const map = mapThreadsToElements(threads, ranges);
    expect(map.size).toBe(0);
  });

  it('groups multiple threads on the same element', () => {
    const ranges = buildRanges('# Title\n\nParagraph\n');
    const threads = groupCommentsIntoThreads([
      makeComment({ id: 1, line: 1 }),
      makeComment({ id: 2, line: 1 }),
    ]);
    const map = mapThreadsToElements(threads, ranges);
    expect(map.size).toBe(1);
    const entries = [...map.values()];
    expect(entries[0]).toHaveLength(2);
  });
});

describe('formatCommentBody', () => {
  it('wraps selected text as a blockquote above the comment', () => {
    const body = formatCommentBody('Great point.', 'Selected text');
    expect(body).toBe('> Selected text\n\nGreat point.');
  });

  it('blockquotes each line of multi-line selections', () => {
    const body = formatCommentBody('Fix this.', 'Line 1\nLine 2\nLine 3');
    expect(body).toContain('> Line 1');
    expect(body).toContain('> Line 2');
    expect(body).toContain('> Line 3');
    expect(body).toContain('Fix this.');
  });
});

describe('renderCommentCard', () => {
  it('renders user login, avatar, date, and body', () => {
    const html = renderCommentCard(makeComment({ id: 1, body: 'Hello world' }));
    expect(html).toContain('user');
    expect(html).toContain('avatar.png');
    expect(html).toContain('Hello world');
    expect(html).toContain('data-comment-id="1"');
  });

  it('escapes HTML in comment body to prevent XSS', () => {
    const html = renderCommentCard(
      makeComment({ id: 1, body: '<script>alert("xss")</script>' })
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes quotes in body', () => {
    const html = renderCommentCard(
      makeComment({ id: 1, body: 'He said "hello"' })
    );
    expect(html).toContain('&quot;hello&quot;');
  });

  it('escapes ampersands in body', () => {
    const html = renderCommentCard(
      makeComment({ id: 1, body: 'A & B' })
    );
    expect(html).toContain('A &amp; B');
  });
});

describe('renderThread', () => {
  it('renders root comment with a reply button', () => {
    const thread = { root: makeComment({ id: 10 }), replies: [] };
    const html = renderThread(thread);
    expect(html).toContain('data-thread-id="10"');
    expect(html).toContain('data-reply-to="10"');
    expect(html).toContain('Reply');
  });

  it('renders root + replies in order', () => {
    const thread = {
      root: makeComment({ id: 10, body: 'Root' }),
      replies: [
        makeComment({ id: 11, body: 'Reply1', in_reply_to_id: 10 }),
        makeComment({ id: 12, body: 'Reply2', in_reply_to_id: 10 }),
      ],
    };
    const html = renderThread(thread);
    expect(html).toContain('Root');
    expect(html).toContain('Reply1');
    expect(html).toContain('Reply2');
    const rootIdx = html.indexOf('Root');
    const r1Idx = html.indexOf('Reply1');
    const r2Idx = html.indexOf('Reply2');
    expect(rootIdx).toBeLessThan(r1Idx);
    expect(r1Idx).toBeLessThan(r2Idx);
  });
});
