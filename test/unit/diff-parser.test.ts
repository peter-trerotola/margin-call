import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseDiff, findNearestCommentableLine } from '../../src/panel/diff-parser.js';

function fixture(name: string): string {
  return readFileSync(
    resolve(__dirname, '../fixtures/diffs', name),
    'utf-8'
  );
}

describe('parseDiff', () => {
  it('parses a new file — all lines are commentable and added', () => {
    const patch = fixture('new-file.diff');
    const result = parseDiff(patch);

    // Lines 1-10 should all be commentable (1-indexed)
    for (let i = 1; i <= 10; i++) {
      expect(result.commentableLines.has(i)).toBe(true);
      expect(result.addedLines.has(i)).toBe(true);
    }
    expect(result.commentableLines.size).toBe(10);
    expect(result.addedLines.size).toBe(10);
    expect(result.added).toBe(10);
    expect(result.removed).toBe(0);
    expect(result.hunks).toEqual([{ start: 1, end: 10 }]);
  });

  it('parses a modified file with multiple hunks', () => {
    const patch = fixture('modified-file.diff');
    const result = parseDiff(patch);

    // First hunk: lines 1-6 in new file
    // Line 1: " # Existing Doc" (context) → commentable
    // Line 2: "" (context) → commentable
    // Line 3: "+New paragraph" (addition) → commentable
    // Line 4: "+Another new line." (addition) → commentable
    // Line 5: "" (context) → commentable
    // Line 6: " Unchanged content below." (context) → commentable
    expect(result.commentableLines.has(1)).toBe(true);
    expect(result.commentableLines.has(2)).toBe(true);
    expect(result.commentableLines.has(3)).toBe(true);
    expect(result.commentableLines.has(4)).toBe(true);
    expect(result.commentableLines.has(5)).toBe(true);
    expect(result.commentableLines.has(6)).toBe(true);

    // Second hunk starts at line 11
    expect(result.commentableLines.has(11)).toBe(true);

    // Lines between hunks (7-10) are NOT commentable
    expect(result.commentableLines.has(7)).toBe(false);
    expect(result.commentableLines.has(8)).toBe(false);

    expect(result.hunks.length).toBe(2);

    // Added lines: 3, 4 (first hunk), 14, 15 (second hunk)
    expect(result.addedLines.has(3)).toBe(true);
    expect(result.addedLines.has(4)).toBe(true);
    expect(result.addedLines.has(14)).toBe(true);
    expect(result.addedLines.has(15)).toBe(true);
    // Context lines should be commentable but NOT in addedLines
    expect(result.addedLines.has(1)).toBe(false);
    expect(result.addedLines.has(11)).toBe(false);
    expect(result.added).toBe(4);
    expect(result.removed).toBe(1);
  });

  it('returns empty result for null/undefined patch', () => {
    expect(parseDiff(null).commentableLines.size).toBe(0);
    expect(parseDiff(undefined).commentableLines.size).toBe(0);
    expect(parseDiff(null).addedLines.size).toBe(0);
    expect(parseDiff(null).hunks.length).toBe(0);
    expect(parseDiff(null).added).toBe(0);
    expect(parseDiff(null).removed).toBe(0);
  });

  it('returns empty result for empty patch', () => {
    const patch = fixture('no-changes.diff');
    const result = parseDiff(patch);
    expect(result.commentableLines.size).toBe(0);
    expect(result.hunks.length).toBe(0);
  });

  it('handles hunk headers with section names', () => {
    const patch = '@@ -1,3 +1,4 @@ function foo\n import { a };\n+import { b };\n \n app();';
    const result = parseDiff(patch);
    expect(result.commentableLines.has(1)).toBe(true);
    expect(result.commentableLines.has(2)).toBe(true);
  });

  it('handles single-line hunks', () => {
    const patch = '@@ -1 +1 @@\n-old\n+new';
    const result = parseDiff(patch);
    expect(result.commentableLines.has(1)).toBe(true);
    expect(result.commentableLines.size).toBe(1);
  });

  it('handles consecutive hunks with no gap', () => {
    const patch =
      '@@ -1,2 +1,2 @@\n-a\n+b\n c\n@@ -3,2 +3,2 @@\n-d\n+e\n f';
    const result = parseDiff(patch);
    expect(result.hunks.length).toBe(2);
    // All modified/context lines should be commentable
    expect(result.commentableLines.has(1)).toBe(true);
    expect(result.commentableLines.has(2)).toBe(true);
    expect(result.commentableLines.has(3)).toBe(true);
    expect(result.commentableLines.has(4)).toBe(true);
  });

  it('skips "No newline at end of file" markers', () => {
    const patch = '@@ -1,2 +1,2 @@\n-old\n+new\n\\ No newline at end of file';
    const result = parseDiff(patch);
    expect(result.commentableLines.has(1)).toBe(true);
    expect(result.commentableLines.size).toBe(1);
  });

  it('handles large diffs efficiently', () => {
    // Generate a 1000-line new file diff
    let patch = '@@ -0,0 +1,1000 @@\n';
    for (let i = 0; i < 1000; i++) {
      patch += `+line ${i}\n`;
    }

    const start = performance.now();
    const result = parseDiff(patch);
    const elapsed = performance.now() - start;

    expect(result.commentableLines.size).toBe(1000);
    expect(elapsed).toBeLessThan(100); // Should be very fast
  });
});

describe('findNearestCommentableLine', () => {
  it('returns the target line if commentable', () => {
    const lines = new Set([1, 2, 3, 10, 11]);
    expect(findNearestCommentableLine(2, lines)).toBe(2);
  });

  it('returns the nearest line when target is not commentable', () => {
    const lines = new Set([1, 2, 10, 11]);
    expect(findNearestCommentableLine(5, lines)).toBe(2);
  });

  it('returns the nearest line above or below', () => {
    const lines = new Set([1, 10]);
    expect(findNearestCommentableLine(6, lines)).toBe(10);
  });

  it('returns null for empty set', () => {
    expect(findNearestCommentableLine(5, new Set())).toBeNull();
  });
});
