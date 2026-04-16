import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { JSDOM } from 'jsdom';
import { renderMarkdown, buildLineRangeMap } from '../../src/panel/renderer.js';
import {
  groupCommentsIntoThreads,
  mapThreadsToElements,
  partitionThreadsByLevel,
  renderThread,
  renderCommentCard,
  type CommentThread,
} from '../../src/panel/comments.js';
import type { ReviewComment } from '../../src/panel/github-api.js';

function loadFixture(name: string): string {
  return readFileSync(
    resolve(__dirname, '../fixtures/api-responses', name),
    'utf-8'
  );
}

function createRenderedDoc(markdown: string) {
  const html = renderMarkdown(markdown);
  const dom = new JSDOM(`<div id="root">${html}</div>`);
  const root = dom.window.document.getElementById('root')!;
  const lineRanges = buildLineRangeMap(root);
  return { dom, root, lineRanges };
}

describe('comment display integration', () => {
  const comments: ReviewComment[] = JSON.parse(
    loadFixture('comments.json')
  );

  it('groups fixture comments into correct threads', () => {
    const threads = groupCommentsIntoThreads(comments);

    // Comment 101 is a root, 102 is its reply, 103 is another root
    expect(threads.length).toBe(2);
    expect(threads[0].root.id).toBe(101);
    expect(threads[0].replies.length).toBe(1);
    expect(threads[0].replies[0].id).toBe(102);
    expect(threads[1].root.id).toBe(103);
    expect(threads[1].replies.length).toBe(0);
  });

  it('maps threads to rendered elements by line number', () => {
    const markdown =
      '# RFC-001\n\n## Summary\n\nThis document describes the service architecture.\n\n## Details\n\nMore content here.\n';
    const { root, lineRanges } = createRenderedDoc(markdown);

    const threads = groupCommentsIntoThreads(comments);
    const threadMap = mapThreadsToElements(threads, lineRanges);

    // Should have at least one mapping
    expect(threadMap.size).toBeGreaterThan(0);

    // Threads should be mapped to elements
    for (const [element, elementThreads] of threadMap) {
      expect(element).toBeDefined();
      expect(elementThreads.length).toBeGreaterThan(0);
    }
  });

  it('handles comments on lines that have no matching rendered element', () => {
    // Render a very short document — comments reference lines beyond it
    const markdown = '# Title\n';
    const { lineRanges } = createRenderedDoc(markdown);

    const farAwayComments: ReviewComment[] = [
      {
        id: 999,
        body: 'Comment on line 50',
        line: 50,
        start_line: null,
        path: 'doc.md',
        user: { login: 'ghost', avatar_url: '' },
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    const threads = groupCommentsIntoThreads(farAwayComments);
    const threadMap = mapThreadsToElements(threads, lineRanges);

    // Comment on line 50 has no matching element — threadMap should be empty
    expect(threadMap.size).toBe(0);
  });

  it('handles empty comment list', () => {
    const markdown = '# Title\n\nContent\n';
    const { lineRanges } = createRenderedDoc(markdown);

    const threads = groupCommentsIntoThreads([]);
    const threadMap = mapThreadsToElements(threads, lineRanges);

    expect(threadMap.size).toBe(0);
  });

  it('handles comments with null line', () => {
    const markdown = '# Title\n';
    const { lineRanges } = createRenderedDoc(markdown);

    const nullLineComments: ReviewComment[] = [
      {
        id: 888,
        body: 'File-level comment',
        line: null,
        start_line: null,
        path: 'doc.md',
        user: { login: 'user', avatar_url: '' },
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    const threads = groupCommentsIntoThreads(nullLineComments);
    const threadMap = mapThreadsToElements(threads, lineRanges);

    // File-level comments (null line) should not be mapped to elements
    expect(threadMap.size).toBe(0);
  });
});

describe('partitionThreadsByLevel', () => {
  it('separates file-level threads (line=null) from line-level threads', () => {
    const threads: CommentThread[] = [
      {
        root: {
          id: 1,
          body: 'On line 5',
          line: 5,
          start_line: null,
          path: 'doc.md',
          user: { login: 'a', avatar_url: '' },
          created_at: '2026-01-01T00:00:00Z',
        },
        replies: [],
      },
      {
        root: {
          id: 2,
          body: 'On the file',
          line: null,
          start_line: null,
          path: 'doc.md',
          user: { login: 'b', avatar_url: '' },
          created_at: '2026-01-01T01:00:00Z',
        },
        replies: [],
      },
      {
        root: {
          id: 3,
          body: 'Also file-level',
          line: null,
          start_line: null,
          path: 'doc.md',
          user: { login: 'c', avatar_url: '' },
          created_at: '2026-01-01T02:00:00Z',
        },
        replies: [],
      },
    ];

    const { fileLevel, lineLevel } = partitionThreadsByLevel(threads);
    expect(lineLevel.length).toBe(1);
    expect(lineLevel[0].root.id).toBe(1);
    expect(fileLevel.length).toBe(2);
    expect(fileLevel.map((t) => t.root.id)).toEqual([2, 3]);
  });

  it('returns empty partitions for an empty input', () => {
    const result = partitionThreadsByLevel([]);
    expect(result.fileLevel).toEqual([]);
    expect(result.lineLevel).toEqual([]);
  });
});

describe('comment rendering', () => {
  it('renders a comment card with user info and body', () => {
    const comment: ReviewComment = {
      id: 1,
      body: 'This looks good!',
      line: 5,
      start_line: null,
      path: 'doc.md',
      user: { login: 'reviewer', avatar_url: 'https://example.com/avatar.png' },
      created_at: '2026-04-10T12:00:00Z',
    };

    const html = renderCommentCard(comment);

    expect(html).toContain('reviewer');
    expect(html).toContain('This looks good!');
    expect(html).toContain('data-comment-id="1"');
    expect(html).toContain('avatar.png');
  });

  it('escapes HTML in comment body', () => {
    const comment: ReviewComment = {
      id: 2,
      body: '<script>alert("xss")</script>',
      line: 1,
      start_line: null,
      path: 'doc.md',
      user: { login: 'attacker', avatar_url: '' },
      created_at: '2026-01-01T00:00:00Z',
    };

    const html = renderCommentCard(comment);

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders a full thread with root and replies', () => {
    const thread: CommentThread = {
      root: {
        id: 10,
        body: 'Root comment',
        line: 1,
        start_line: null,
        path: 'doc.md',
        user: { login: 'reviewer', avatar_url: '' },
        created_at: '2026-01-01T00:00:00Z',
      },
      replies: [
        {
          id: 11,
          body: 'Reply 1',
          line: 1,
          start_line: null,
          path: 'doc.md',
          user: { login: 'author', avatar_url: '' },
          created_at: '2026-01-01T01:00:00Z',
          in_reply_to_id: 10,
        },
      ],
    };

    const html = renderThread(thread);

    expect(html).toContain('data-thread-id="10"');
    expect(html).toContain('Root comment');
    expect(html).toContain('Reply 1');
    expect(html).toContain('data-reply-to="10"');
  });
});
