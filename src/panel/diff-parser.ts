/**
 * Parse a unified diff patch string to extract which lines in the new version
 * of the file are "commentable" — i.e., appear in the diff and can receive
 * a GitHub PR review comment.
 *
 * Context lines (` `) and additions (`+`) are commentable.
 * Deletions (`-`) exist only in the old file and are not commentable on the RIGHT side.
 */

export interface HunkRange {
  start: number;
  end: number;
}

export interface DiffResult {
  /** All lines (additions + context) that can receive a PR review comment. */
  commentableLines: Set<number>;
  /** Lines that were added (`+` in the diff). Subset of commentableLines. */
  addedLines: Set<number>;
  /** Hunk ranges in the new file. */
  hunks: HunkRange[];
  /** Total counts for legend display. */
  added: number;
  removed: number;
}

const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

export function parseDiff(patch: string | undefined | null): DiffResult {
  const commentableLines = new Set<number>();
  const addedLines = new Set<number>();
  const hunks: HunkRange[] = [];
  let added = 0;
  let removed = 0;

  if (!patch) {
    return { commentableLines, addedLines, hunks, added, removed };
  }

  const lines = patch.split('\n');
  // Remove trailing empty string from split (artifact of trailing newline)
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  let currentLine = 0;
  let hunkStart = 0;
  let inHunk = false;

  for (const line of lines) {
    const hunkMatch = line.match(HUNK_HEADER_RE);

    if (hunkMatch) {
      // Close the previous hunk
      if (inHunk && hunkStart > 0) {
        hunks.push({ start: hunkStart, end: currentLine - 1 });
      }

      currentLine = parseInt(hunkMatch[1], 10);
      hunkStart = currentLine;
      inHunk = true;
      continue;
    }

    if (!inHunk) continue;

    if (line.startsWith('+')) {
      // Addition — commentable on RIGHT side
      commentableLines.add(currentLine);
      addedLines.add(currentLine);
      added++;
      currentLine++;
    } else if (line.startsWith('-')) {
      // Deletion — only in old file, does NOT increment new-file line counter
      // Not commentable on RIGHT side
      removed++;
    } else if (line.startsWith(' ') || line === '') {
      // Context line — commentable (it appears in the diff).
      // Empty lines within a hunk are context lines (git may strip the
      // leading space from empty context lines).
      commentableLines.add(currentLine);
      currentLine++;
    } else if (line === '\\ No newline at end of file') {
      // Special marker — skip
    }
  }

  // Close the last hunk
  if (inHunk && hunkStart > 0) {
    hunks.push({ start: hunkStart, end: currentLine - 1 });
  }

  return { commentableLines, addedLines, hunks, added, removed };
}

/**
 * Find the nearest commentable line to a given target line.
 * Returns the target itself if it's commentable, otherwise
 * the closest commentable line (preferring the line above).
 */
export function findNearestCommentableLine(
  target: number,
  commentableLines: Set<number>
): number | null {
  if (commentableLines.size === 0) return null;
  if (commentableLines.has(target)) return target;

  const sorted = [...commentableLines].sort((a, b) => a - b);
  let closest: number | null = null;
  let minDist = Infinity;

  for (const line of sorted) {
    const dist = Math.abs(line - target);
    if (dist < minDist) {
      minDist = dist;
      closest = line;
    }
  }

  return closest;
}
