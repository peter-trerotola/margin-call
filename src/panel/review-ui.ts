/**
 * Google Docs-style review UI:
 *   - Inline (line-level) comments render in the RIGHT sidebar, vertically
 *     aligned with the text they reference. Commented text gets a highlight;
 *     clicking the highlight flashes the corresponding comment card.
 *   - File-level comments render in the LEFT sidebar.
 *   - Text selection → floating "Comment" button → form in the right sidebar.
 */
import type { LineRange } from './renderer.js';
import { analyzeSelection, type SelectionResult } from './selection.js';
import {
  formatCommentBody,
  groupCommentsIntoThreads,
  mapThreadsToElements,
  partitionThreadsByLevel,
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
  fileCommentsContainer?: HTMLElement;
  /** Right sidebar where inline comments are rendered. */
  inlineCommentsContainer?: HTMLElement;
  lineRanges: LineRange[];
  commentableLines: Set<number>;
}

export interface ReviewUI {
  displayComments(comments: ReviewComment[]): void;
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function positionCommentButton(
  button: HTMLButtonElement,
  rect: DOMRect
): void {
  button.style.top = `${rect.bottom + 4}px`;
  button.style.left = `${rect.left}px`;
  button.hidden = false;
}

function hideButton(button: HTMLButtonElement): void {
  button.hidden = true;
}

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
  cancelBtn.addEventListener('click', () => opts.onCancel());

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

/**
 * Add a highlight background to a markdown element that has a comment.
 * Returns a cleanup function that removes the highlight.
 */
function highlightAnchor(anchor: Element, threadId: number): () => void {
  anchor.classList.add('mc-has-comment');
  anchor.setAttribute('data-thread-id', String(threadId));
  return () => {
    anchor.classList.remove('mc-has-comment');
    anchor.removeAttribute('data-thread-id');
  };
}

/** Flash a comment card in the sidebar to draw attention to it. */
function flashComment(threadEl: Element): void {
  threadEl.classList.add('mc-flash');
  threadEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  setTimeout(() => threadEl.classList.remove('mc-flash'), 1500);
}

// ---------------------------------------------------------------------------
// Main setup
// ---------------------------------------------------------------------------

export function setupReviewUI(ctx: ReviewUIContext): ReviewUI {
  const {
    owner,
    repo,
    pull,
    path,
    commit_id,
    container,
    commentButton,
    fileCommentsContainer,
    inlineCommentsContainer,
    lineRanges,
    commentableLines,
  } = ctx;

  let currentSelection: SelectionResult | null = null;

  // Map thread ID → sidebar element (for click-to-flash)
  const threadElements = new Map<number, HTMLElement>();

  // ---------------------------------------------------------------------------
  // Inline (line-level) comments → RIGHT sidebar
  // ---------------------------------------------------------------------------

  /**
   * Render a thread in the right sidebar, positioned to vertically align
   * with the anchor element in the markdown body.
   */
  function displayThread(anchor: Element, thread: CommentThread): void {
    if (!inlineCommentsContainer) return;

    const card = document.createElement('div');
    card.className = 'sidebar-comment';
    card.setAttribute('data-thread-id', String(thread.root.id));
    card.innerHTML = renderThread(thread);

    // Position: align top of card with top of anchor element.
    // Uses a data attribute; CSS uses position:relative on the sidebar
    // and absolute on each card, with `top` set dynamically.
    const anchorRect = anchor.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const offsetTop = anchorRect.top - containerRect.top + container.scrollTop;
    card.style.position = 'absolute';
    card.style.top = `${offsetTop}px`;
    card.style.left = '20px';
    card.style.right = '20px';

    inlineCommentsContainer.appendChild(card);
    threadElements.set(thread.root.id, card);

    // Highlight the anchor text
    const removeHighlight = highlightAnchor(anchor, thread.root.id);

    // Reply button
    const replyBtn = card.querySelector<HTMLButtonElement>('.reply-btn');
    if (replyBtn) {
      replyBtn.addEventListener('click', () => {
        replyBtn.disabled = true;
        const form = createCommentForm({
          placeholder: `Reply to @${thread.root.user.login}`,
          onSubmit: async (body) => {
            const reply = await postReply(owner, repo, pull, thread.root.id, body);
            thread.replies.push(reply);
            form.remove();
            removeHighlight();
            card.remove();
            threadElements.delete(thread.root.id);
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

  // ---------------------------------------------------------------------------
  // File-level comments → LEFT sidebar
  // ---------------------------------------------------------------------------

  function displayFileLevelThread(thread: CommentThread): void {
    if (!fileCommentsContainer) return;
    const card = document.createElement('div');
    card.innerHTML = renderThread(thread);
    const rendered = card.firstElementChild as HTMLElement;
    fileCommentsContainer.appendChild(rendered);

    const replyBtn = rendered.querySelector<HTMLButtonElement>('.reply-btn');
    if (replyBtn) {
      replyBtn.addEventListener('click', () => {
        replyBtn.disabled = true;
        const form = createCommentForm({
          placeholder: `Reply to @${thread.root.user.login}`,
          onSubmit: async (body) => {
            const reply = await postReply(owner, repo, pull, thread.root.id, body);
            thread.replies.push(reply);
            form.remove();
            fileCommentsContainer.removeChild(rendered);
            displayFileLevelThread(thread);
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

  // ---------------------------------------------------------------------------
  // Display all comments
  // ---------------------------------------------------------------------------

  function displayComments(comments: ReviewComment[]): void {
    const threads = groupCommentsIntoThreads(comments);
    const { fileLevel, lineLevel } = partitionThreadsByLevel(threads);

    const anchorMap = mapThreadsToElements(lineLevel, lineRanges);
    for (const [anchor, anchorThreads] of anchorMap) {
      for (const thread of anchorThreads) {
        displayThread(anchor, thread);
      }
    }

    for (const thread of fileLevel) {
      displayFileLevelThread(thread);
    }
  }

  // ---------------------------------------------------------------------------
  // Click-to-flash: clicking highlighted text scrolls to / flashes the comment
  // ---------------------------------------------------------------------------

  function onContentClick(e: MouseEvent): void {
    const target = (e.target as HTMLElement).closest?.('[data-thread-id]');
    if (!target) return;
    const threadId = parseInt(target.getAttribute('data-thread-id')!, 10);
    const card = threadElements.get(threadId);
    if (card) flashComment(card);
  }

  container.addEventListener('click', onContentClick);

  // ---------------------------------------------------------------------------
  // Selection → comment button
  // ---------------------------------------------------------------------------

  function onMouseUp(): void {
    setTimeout(() => {
      const result = analyzeSelection(container, lineRanges, commentableLines);
      if (!result) {
        currentSelection = null;
        hideButton(commentButton);
        return;
      }
      currentSelection = result;
      commentButton.classList.remove('disabled');
      const isLineLevel = result.allCommentable;
      commentButton.title = isLineLevel
        ? 'Comment on this line'
        : 'Comment on this file';
      commentButton.textContent = isLineLevel ? 'Comment' : 'Comment on file';
      positionCommentButton(commentButton, result.rect);
    }, 0);
  }

  function onCommentButtonClick(): void {
    if (!currentSelection) return;
    const sel = currentSelection;
    hideButton(commentButton);

    if (sel.allCommentable) {
      submitLineComment(sel);
    } else {
      submitFileComment(sel);
    }
  }

  // ---------------------------------------------------------------------------
  // Submit comments
  // ---------------------------------------------------------------------------

  function submitLineComment(sel: SelectionResult): void {
    const anchorEl = [...lineRanges]
      .reverse()
      .find(
        (lr) =>
          sel.commentableEndLine !== null &&
          lr.startLine + 1 <= sel.commentableEndLine &&
          lr.endLine + 1 >= sel.commentableEndLine
      )?.element;

    if (!anchorEl) return;

    // Show form in the right sidebar, aligned with the anchor
    const target = inlineCommentsContainer ?? container;
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
      onCancel: () => form.remove(),
    });

    if (inlineCommentsContainer) {
      const anchorRect = anchorEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const offsetTop = anchorRect.top - containerRect.top + container.scrollTop;
      form.style.position = 'absolute';
      form.style.top = `${offsetTop}px`;
      form.style.left = '20px';
      form.style.right = '20px';
      inlineCommentsContainer.appendChild(form);
    } else {
      anchorEl.insertAdjacentElement('afterend', form);
    }
  }

  function submitFileComment(sel: SelectionResult): void {
    const target = fileCommentsContainer ?? container;
    const form = createCommentForm({
      selectedText: sel.selectedText,
      placeholder: 'Leave a file-level comment',
      onSubmit: async (body) => {
        const comment = await postComment({
          owner, repo, pull_number: pull, body, commit_id, path,
          subject_type: 'file',
        });
        form.remove();
        displayFileLevelThread({ root: comment, replies: [] });
        currentSelection = null;
        window.getSelection()?.removeAllRanges();
      },
      onCancel: () => form.remove(),
    });
    target.appendChild(form);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  container.addEventListener('mouseup', onMouseUp);
  commentButton.addEventListener('click', onCommentButtonClick);

  return {
    displayComments,
    destroy() {
      container.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('click', onContentClick);
      commentButton.removeEventListener('click', onCommentButtonClick);
    },
  };
}
