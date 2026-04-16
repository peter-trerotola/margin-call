import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderMarkdown, buildLineRangeMap } from '../../src/panel/renderer.js';
import { setupReviewUI } from '../../src/panel/review-ui.js';
import { setStorageData } from '../mocks/chrome.js';
import type { ReviewComment } from '../../src/panel/github-api.js';

/**
 * Sets up a jsdom environment with a rendered markdown document,
 * a comment button, and a ready-to-use ReviewUIContext for tests.
 */
function setupDom(markdown: string, commentableLines: Set<number>) {
  const html = renderMarkdown(markdown);
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body>
       <div id="content">${html}</div>
       <button id="comment-button" hidden></button>
     </body></html>`,
    { pretendToBeVisual: true }
  );

  const container = dom.window.document.getElementById(
    'content'
  ) as HTMLElement;
  const commentButton = dom.window.document.getElementById(
    'comment-button'
  ) as HTMLButtonElement;

  // Make jsdom globals available to selection.ts and review-ui.ts
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = dom.window;
  g.document = dom.window.document;
  g.HTMLElement = dom.window.HTMLElement;
  g.HTMLButtonElement = dom.window.HTMLButtonElement;

  const lineRanges = buildLineRangeMap(container);

  return {
    dom,
    doc: dom.window.document,
    container,
    commentButton,
    lineRanges,
    commentableLines,
  };
}

describe('setupReviewUI', () => {
  beforeEach(() => {
    setStorageData({ github_token: 'gho_test' });
    vi.restoreAllMocks();
  });

  it('renders existing comments inline on their anchored elements', () => {
    const markdown = '# Title\n\n## Section One\n\nParagraph here.\n';
    const { container, commentButton, lineRanges, commentableLines } =
      setupDom(markdown, new Set([1, 2, 3, 4, 5]));

    const ui = setupReviewUI({
      owner: 'a',
      repo: 'b',
      pull: 1,
      path: 'doc.md',
      commit_id: 'sha',
      container,
      commentButton,
      lineRanges,
      commentableLines,
    });

    const comments: ReviewComment[] = [
      {
        id: 10,
        body: 'Existing comment',
        line: 1,
        start_line: null,
        path: 'doc.md',
        user: { login: 'reviewer', avatar_url: '' },
        created_at: '2026-04-10T12:00:00Z',
      },
      {
        id: 11,
        body: 'Reply',
        line: 1,
        start_line: null,
        path: 'doc.md',
        user: { login: 'author', avatar_url: '' },
        created_at: '2026-04-10T13:00:00Z',
        in_reply_to_id: 10,
      },
    ];

    ui.displayComments(comments);

    // Thread container appears in the DOM
    const threads = container.parentElement!.querySelectorAll(
      '.comment-thread'
    );
    expect(threads.length).toBeGreaterThan(0);
    const threadHtml = threads[0].innerHTML;
    expect(threadHtml).toContain('Existing comment');
    expect(threadHtml).toContain('Reply');

    ui.destroy();
  });

  it('shows the floating comment button for a commentable selection', () => {
    const markdown = '# Title\n\nCommentable paragraph.\n';
    const { dom, container, commentButton, lineRanges, commentableLines } =
      setupDom(markdown, new Set([1, 2, 3]));

    setupReviewUI({
      owner: 'a',
      repo: 'b',
      pull: 1,
      path: 'doc.md',
      commit_id: 'sha',
      container,
      commentButton,
      lineRanges,
      commentableLines,
    });

    // Select the paragraph
    const p = container.querySelector('p')!;
    const range = dom.window.document.createRange();
    range.selectNodeContents(p);

    vi.spyOn(dom.window, 'getSelection').mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      toString: () => 'Commentable paragraph.',
      getRangeAt: () => range,
      removeAllRanges: () => {},
    } as unknown as Selection);

    // Fire mouseup on the container
    container.dispatchEvent(new dom.window.Event('mouseup', { bubbles: true }));

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(commentButton.hidden).toBe(false);
        expect(commentButton.classList.contains('disabled')).toBe(false);
        resolve();
      }, 10);
    });
  });

  it('keeps the comment button enabled for non-commentable selections (file-level fallback)', () => {
    const markdown = '# Title\n\nNot in the diff.\n';
    const { dom, container, commentButton, lineRanges } = setupDom(
      markdown,
      new Set() // nothing is commentable
    );

    setupReviewUI({
      owner: 'a',
      repo: 'b',
      pull: 1,
      path: 'doc.md',
      commit_id: 'sha',
      container,
      commentButton,
      lineRanges,
      commentableLines: new Set(),
    });

    const p = container.querySelector('p')!;
    const range = dom.window.document.createRange();
    range.selectNodeContents(p);

    vi.spyOn(dom.window, 'getSelection').mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      toString: () => 'Not in the diff.',
      getRangeAt: () => range,
      removeAllRanges: () => {},
    } as unknown as Selection);

    container.dispatchEvent(new dom.window.Event('mouseup', { bubbles: true }));

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        // No longer disabled — instead the button switches to file-level mode
        expect(commentButton.classList.contains('disabled')).toBe(false);
        expect(commentButton.hidden).toBe(false);
        expect(commentButton.textContent).toBe('Comment on file');
        expect(commentButton.title).toContain('file-level');
        resolve();
      }, 10);
    });
  });

  it('hides the button for a collapsed selection', () => {
    const markdown = '# Title\n\nParagraph.\n';
    const { dom, container, commentButton, lineRanges } = setupDom(
      markdown,
      new Set([1, 2, 3])
    );

    // Button starts hidden, then we trigger mouseup with a collapsed selection
    setupReviewUI({
      owner: 'a',
      repo: 'b',
      pull: 1,
      path: 'doc.md',
      commit_id: 'sha',
      container,
      commentButton,
      lineRanges,
      commentableLines: new Set([1, 2, 3]),
    });

    vi.spyOn(dom.window, 'getSelection').mockReturnValue({
      isCollapsed: true,
      rangeCount: 0,
      toString: () => '',
      getRangeAt: () => {
        throw new Error('no range');
      },
      removeAllRanges: () => {},
    } as unknown as Selection);

    container.dispatchEvent(new dom.window.Event('mouseup', { bubbles: true }));

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(commentButton.hidden).toBe(true);
        resolve();
      }, 10);
    });
  });

  it('groups comment threads correctly from grouped comments', () => {
    const markdown = '# Title\n\nPara one.\n\nPara two.\n';
    const { container, commentButton, lineRanges } = setupDom(
      markdown,
      new Set([1, 2, 3, 4, 5])
    );

    const ui = setupReviewUI({
      owner: 'a',
      repo: 'b',
      pull: 1,
      path: 'doc.md',
      commit_id: 'sha',
      container,
      commentButton,
      lineRanges,
      commentableLines: new Set([1, 2, 3, 4, 5]),
    });

    const comments: ReviewComment[] = [
      {
        id: 1,
        body: 'Root A',
        line: 1,
        start_line: null,
        path: 'doc.md',
        user: { login: 'u1', avatar_url: '' },
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 2,
        body: 'Root B',
        line: 3,
        start_line: null,
        path: 'doc.md',
        user: { login: 'u2', avatar_url: '' },
        created_at: '2026-01-01T01:00:00Z',
      },
    ];

    ui.displayComments(comments);

    // Two thread containers should exist in the DOM (one per anchor)
    const threads = container.parentElement!.querySelectorAll(
      '.comment-thread'
    );
    expect(threads.length).toBe(2);
  });
});
