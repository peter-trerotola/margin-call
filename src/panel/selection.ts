import type { LineRange } from './renderer.js';

export interface SelectionResult {
  /** The text the user selected. */
  selectedText: string;
  /** Start line in the source markdown (inclusive, 0-indexed). */
  startLine: number;
  /** End line in the source markdown (inclusive, 0-indexed). */
  endLine: number;
  /** Whether all lines in the range are commentable. */
  allCommentable: boolean;
  /** The subset of lines that are commentable (1-indexed, for GitHub API). */
  commentableStartLine: number | null;
  commentableEndLine: number | null;
  /** Bounding rect for positioning the comment button. */
  rect: DOMRect;
}

/**
 * Analyze the current text selection within a markdown container
 * and map it to source line numbers using the line range map.
 *
 * @param container - The markdown content container element.
 * @param lineRanges - The line range map from buildLineRangeMap.
 * @param commentableLines - Set of 1-indexed line numbers that are commentable.
 * @returns The selection result, or null if no valid selection.
 */
export function analyzeSelection(
  container: Element,
  lineRanges: LineRange[],
  commentableLines: Set<number>
): SelectionResult | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const selectedText = selection.toString().trim();
  if (!selectedText) return null;

  // Check that the selection is within the container
  if (!container.contains(range.commonAncestorContainer)) {
    return null;
  }

  // Find all line-range elements that intersect the selection
  const intersecting: LineRange[] = [];
  for (const lr of lineRanges) {
    if (range.intersectsNode(lr.element)) {
      intersecting.push(lr);
    }
  }

  if (intersecting.length === 0) return null;

  const startLine = Math.min(...intersecting.map((lr) => lr.startLine));
  const endLine = Math.max(...intersecting.map((lr) => lr.endLine));

  // Convert 0-indexed source lines to 1-indexed for GitHub API
  // GitHub API uses 1-indexed line numbers
  const apiStartLine = startLine + 1;
  const apiEndLine = endLine + 1;

  // Check which lines in the range are commentable
  const rangeLines: number[] = [];
  for (let l = apiStartLine; l <= apiEndLine; l++) {
    rangeLines.push(l);
  }

  const commentableInRange = rangeLines.filter((l) =>
    commentableLines.has(l)
  );
  const allCommentable =
    commentableInRange.length === rangeLines.length && rangeLines.length > 0;

  const commentableStartLine =
    commentableInRange.length > 0
      ? Math.min(...commentableInRange)
      : null;
  const commentableEndLine =
    commentableInRange.length > 0
      ? Math.max(...commentableInRange)
      : null;

  // getBoundingClientRect may not be available in jsdom/testing environments
  const rect =
    typeof range.getBoundingClientRect === 'function'
      ? range.getBoundingClientRect()
      : new DOMRect(0, 0, 0, 0);

  return {
    selectedText,
    startLine,
    endLine,
    allCommentable,
    commentableStartLine,
    commentableEndLine,
    rect,
  };
}
