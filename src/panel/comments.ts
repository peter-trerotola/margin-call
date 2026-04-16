import {
  postComment,
  postReply,
  fetchPrComments,
  type ReviewComment,
  type PostCommentParams,
} from './github-api.js';
import type { LineRange } from './renderer.js';

export interface CommentThread {
  root: ReviewComment;
  replies: ReviewComment[];
}

/**
 * Group flat comments into threads.
 * Root comments have no `in_reply_to_id`.
 * Replies are grouped under their root comment.
 */
export function groupCommentsIntoThreads(
  comments: ReviewComment[]
): CommentThread[] {
  const rootComments = comments.filter((c) => !c.in_reply_to_id);
  const replyMap = new Map<number, ReviewComment[]>();

  for (const c of comments) {
    if (c.in_reply_to_id) {
      const replies = replyMap.get(c.in_reply_to_id) ?? [];
      replies.push(c);
      replyMap.set(c.in_reply_to_id, replies);
    }
  }

  return rootComments.map((root) => ({
    root,
    replies: (replyMap.get(root.id) ?? []).sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ),
  }));
}

/**
 * Map comment threads to their corresponding DOM elements using line ranges.
 * Returns a map of element → threads anchored to that element.
 */
export function mapThreadsToElements(
  threads: CommentThread[],
  lineRanges: LineRange[]
): Map<Element, CommentThread[]> {
  const elementMap = new Map<Element, CommentThread[]>();

  for (const thread of threads) {
    const line = thread.root.line;
    if (line === null) continue;

    // Find the line range that contains this line (1-indexed API line → 0-indexed source line)
    const sourceLine = line - 1;
    const matchingRange = lineRanges.find(
      (lr) => sourceLine >= lr.startLine && sourceLine <= lr.endLine
    );

    if (matchingRange) {
      const existing = elementMap.get(matchingRange.element) ?? [];
      existing.push(thread);
      elementMap.set(matchingRange.element, existing);
    }
  }

  return elementMap;
}

/** Format selected text as a blockquote for the comment body. */
export function formatCommentBody(
  userComment: string,
  selectedText: string
): string {
  const quotedText = selectedText
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

  return `${quotedText}\n\n${userComment}`;
}

/** Create the HTML for a comment card. */
export function renderCommentCard(comment: ReviewComment): string {
  const date = new Date(comment.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return `
    <div class="comment-card" data-comment-id="${comment.id}">
      <div class="comment-header">
        <img class="comment-avatar" src="${comment.user.avatar_url}" alt="${comment.user.login}" />
        <strong class="comment-author">${comment.user.login}</strong>
        <span class="comment-date">${date}</span>
      </div>
      <div class="comment-body">${escapeHtml(comment.body)}</div>
    </div>
  `;
}

/** Render a full thread (root + replies). */
export function renderThread(thread: CommentThread): string {
  const rootCard = renderCommentCard(thread.root);
  const replyCards = thread.replies
    .map((r) => renderCommentCard(r))
    .join('');

  return `
    <div class="comment-thread" data-thread-id="${thread.root.id}">
      ${rootCard}
      ${replyCards}
      <button class="reply-btn" data-reply-to="${thread.root.id}">Reply</button>
    </div>
  `;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
