/**
 * Wires up the interactive review UI on the panel page:
 *   - listens for text selections in the markdown container
 *   - shows a floating "Comment" button positioned near the selection
 *   - opens a comment form on click, posts via the GitHub API
 *   - renders existing review comments inline next to their anchored elements
 *   - handles reply flow on existing comment threads
 *
 * This module is the glue between the pure renderer/selection/diff-parser
 * modules and the DOM. It does not own the data-fetching or markdown
 * rendering — those happen in index.ts and are passed in.
 */
import type { LineRange } from './renderer.js';
import { analyzeSelection, type SelectionResult } from './selection.js';
import {
  formatCommentBody,
  groupCommentsIntoThreads,
  mapThreadsToElements,
  renderThread,
  type CommentThread,
} from './comments.js';
import {
  postComment,
  postReply,
  type ReviewComment,
} from './github-api.js';

export interface ReviewUIContext {
  owner: string;
  repo: string;
  pull: number;
  path: string;
  commit_id: string;
  container: HTMLElement;
  commentButton: HTMLButtonElement;
  lineRanges: LineRange[];
  commentableLines: Set<number>;
}

export interface ReviewUI {
  /** Display existing review comments inline. */
  displayComments(comments: ReviewComment[]): void;
  /** Detach event listeners (for tests / teardown). */
  destroy(): void;
}

/**
 * Position the floating comment button near a selection rectangle.
 * Uses viewport coordinates because the button is `position: fixed`.
 * getBoundingClientRect() also returns viewport-relative coords, so
 * we use rect values directly without adding window.scrollY/scrollX.
 */
function positionCommentButton(
  button: HTMLButtonElement,
  rect: DOMRect
): void {
  const margin = 4;
  button.style.top = `${rect.bottom + margin}px`;
  button.style.left = `${rect.left}px`;
  button.hidden = false;
}

function hideButton(button: HTMLButtonElement): void {
  button.hidden = true;
}

/** Render an inline comment form anchored below a specific element. */
function createCommentForm(opts: {
  selectedText?: string;
  placeholder: string;
  onSubmit: (body: string) => Promise<void>;
  onCancel: () => void;
}): HTMLElement {
  const form = document.createElement('div');
  form.className = 'comment-form';

  const textarea = document.createElement('textarea');
  textarea.placeholder = opts.placeholder;
  form.appendChild(textarea);

  const actions = document.createElement('div');
  actions.className = 'comment-form-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    opts.onCancel();
  });

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'btn-submit';
  submitBtn.textContent = 'Comment';
  submitBtn.addEventListener('click', async () => {
    const raw = textarea.value.trim();
    if (!raw) return;
    submitBtn.disabled = true;
    cancelBtn.disabled = true;
    const body = opts.selectedText
      ? formatCommentBody(raw, opts.selectedText)
      : raw;
    try {
      await opts.onSubmit(body);
    } catch (err) {
      submitBtn.disabled = false;
      cancelBtn.disabled = false;
      const errEl = document.createElement('p');
      errEl.className = 'error-msg';
      errEl.textContent = (err as Error).message;
      form.appendChild(errEl);
    }
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(submitBtn);
  form.appendChild(actions);

  setTimeout(() => textarea.focus(), 0);
  return form;
}

export function setupReviewUI(ctx: ReviewUIContext): ReviewUI {
  const {
    owner,
    repo,
    pull,
    path,
    commit_id,
    container,
    commentButton,
    lineRanges,
    commentableLines,
  } = ctx;

  let currentSelection: SelectionResult | null = null;
  const threadContainers = new Map<Element, HTMLElement>();

  function ensureThreadContainer(anchor: Element): HTMLElement {
    const existing = threadContainers.get(anchor);
    if (existing) return existing;
    const wrapper = document.createElement('div');
    wrapper.className = 'comment-thread-container';
    anchor.insertAdjacentElement('afterend', wrapper);
    threadContainers.set(anchor, wrapper);
    return wrapper;
  }

  function displayThread(anchor: Element, thread: CommentThread): void {
    const wrapper = ensureThreadContainer(anchor);
    const threadEl = document.createElement('div');
    threadEl.innerHTML = renderThread(thread);
    const rendered = threadEl.firstElementChild as HTMLElement;
    wrapper.appendChild(rendered);

    const replyBtn = rendered.querySelector<HTMLButtonElement>('.reply-btn');
    if (replyBtn) {
      replyBtn.addEventListener('click', () => {
        replyBtn.disabled = true;
        const form = createCommentForm({
          placeholder: `Reply to @${thread.root.user.login}`,
          onSubmit: async (body) => {
            const reply = await postReply(
              owner,
              repo,
              pull,
              thread.root.id,
              body
            );
            thread.replies.push(reply);
            form.remove();
            // Re-render the thread in place
            wrapper.removeChild(rendered);
            threadContainers.delete(anchor);
            displayThread(anchor, thread);
          },
          onCancel: () => {
            replyBtn.disabled = false;
            form.remove();
          },
        });
        replyBtn.insertAdjacentElement('beforebegin', form);
      });
    }
  }

  function displayComments(comments: ReviewComment[]): void {
    const threads = groupCommentsIntoThreads(comments);
    const anchorMap = mapThreadsToElements(threads, lineRanges);
    for (const [anchor, anchorThreads] of anchorMap) {
      for (const thread of anchorThreads) {
        displayThread(anchor, thread);
      }
    }
  }

  function onMouseUp(): void {
    // Defer slightly so the selection has settled after click
    setTimeout(() => {
      const result = analyzeSelection(
        container,
        lineRanges,
        commentableLines
      );
      if (!result) {
        currentSelection = null;
        hideButton(commentButton);
        return;
      }
      currentSelection = result;
      commentButton.classList.toggle('disabled', !result.allCommentable);
      commentButton.title = result.allCommentable
        ? 'Add a comment on the selected text'
        : 'This text was not changed in this PR and cannot receive a comment';
      positionCommentButton(commentButton, result.rect);
    }, 0);
  }

  function onCommentButtonClick(): void {
    if (!currentSelection || !currentSelection.allCommentable) return;
    const sel = currentSelection;
    hideButton(commentButton);

    // Anchor the form below the last element in the selection
    const anchorEl = [...lineRanges]
      .reverse()
      .find(
        (lr) =>
          sel.commentableEndLine !== null &&
          lr.startLine + 1 <= sel.commentableEndLine &&
          lr.endLine + 1 >= sel.commentableEndLine
      )?.element;

    if (!anchorEl) return;

    const wrapper = ensureThreadContainer(anchorEl);
    const form = createCommentForm({
      selectedText: sel.selectedText,
      placeholder: 'Leave a comment on this section',
      onSubmit: async (body) => {
        const comment = await postComment({
          owner,
          repo,
          pull_number: pull,
          body,
          commit_id,
          path,
          line: sel.commentableEndLine!,
          side: 'RIGHT',
          start_line:
            sel.commentableStartLine !== sel.commentableEndLine
              ? sel.commentableStartLine ?? undefined
              : undefined,
          start_side:
            sel.commentableStartLine !== sel.commentableEndLine
              ? 'RIGHT'
              : undefined,
        });
        form.remove();
        displayThread(anchorEl, { root: comment, replies: [] });
        currentSelection = null;
        window.getSelection()?.removeAllRanges();
      },
      onCancel: () => {
        form.remove();
      },
    });
    wrapper.appendChild(form);
  }

  function onDocumentMouseDown(e: MouseEvent): void {
    // Hide the floating button if user clicks elsewhere without selecting
    if (e.target !== commentButton) {
      // Let the selection happen first; the mouseup handler decides what to do
    }
  }

  container.addEventListener('mouseup', onMouseUp);
  commentButton.addEventListener('click', onCommentButtonClick);
  document.addEventListener('mousedown', onDocumentMouseDown);

  return {
    displayComments,
    destroy() {
      container.removeEventListener('mouseup', onMouseUp);
      commentButton.removeEventListener('click', onCommentButtonClick);
      document.removeEventListener('mousedown', onDocumentMouseDown);
    },
  };
}
