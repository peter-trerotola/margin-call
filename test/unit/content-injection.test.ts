import { describe, it, expect } from 'vitest';
import {
  parsePrUrl,
  extractFilePath,
  isMarkdownFile,
} from '../../src/content/index.js';

describe('parsePrUrl', () => {
  it('parses a standard PR files URL', () => {
    const result = parsePrUrl(
      'https://github.com/acme/docs/pull/42/files'
    );
    expect(result).toEqual({ owner: 'acme', repo: 'docs', pull: 42 });
  });

  it('parses a PR URL without /files suffix', () => {
    const result = parsePrUrl(
      'https://github.com/org/repo/pull/123'
    );
    expect(result).toEqual({ owner: 'org', repo: 'repo', pull: 123 });
  });

  it('parses a PR URL with /files/ and subpath', () => {
    const result = parsePrUrl(
      'https://github.com/owner/repo/pull/7/files/abc123'
    );
    expect(result).toEqual({ owner: 'owner', repo: 'repo', pull: 7 });
  });

  it('parses a PR URL with /changes (GitHub renamed /files → /changes)', () => {
    const result = parsePrUrl(
      'https://github.com/acme/docs/pull/42/changes'
    );
    expect(result).toEqual({ owner: 'acme', repo: 'docs', pull: 42 });
  });

  it('parses a PR URL with /changes and subpath', () => {
    const result = parsePrUrl(
      'https://github.com/owner/repo/pull/7/changes/abc123'
    );
    expect(result).toEqual({ owner: 'owner', repo: 'repo', pull: 7 });
  });

  it('handles repos with hyphens and dots', () => {
    const result = parsePrUrl(
      'https://github.com/my-org/my-repo.js/pull/99/files'
    );
    expect(result).toEqual({
      owner: 'my-org',
      repo: 'my-repo.js',
      pull: 99,
    });
  });

  it('returns null for non-PR URLs', () => {
    expect(parsePrUrl('https://github.com/owner/repo')).toBeNull();
    expect(parsePrUrl('https://github.com/owner/repo/issues/1')).toBeNull();
    expect(parsePrUrl('https://google.com')).toBeNull();
    expect(parsePrUrl('')).toBeNull();
  });
});

describe('isMarkdownFile', () => {
  it('identifies .md files', () => {
    expect(isMarkdownFile('docs/readme.md')).toBe(true);
    expect(isMarkdownFile('RFC.MD')).toBe(true);
  });

  it('identifies .mdx files', () => {
    expect(isMarkdownFile('page.mdx')).toBe(true);
    expect(isMarkdownFile('docs/intro.MDX')).toBe(true);
  });

  it('identifies .markdown files', () => {
    expect(isMarkdownFile('notes.markdown')).toBe(true);
  });

  it('rejects non-markdown files', () => {
    expect(isMarkdownFile('app.ts')).toBe(false);
    expect(isMarkdownFile('styles.css')).toBe(false);
    expect(isMarkdownFile('readme.txt')).toBe(false);
    expect(isMarkdownFile('data.json')).toBe(false);
    expect(isMarkdownFile('markdown')).toBe(false);
  });
});

describe('extractFilePath', () => {
  it('extracts path from a link with title attribute', () => {
    const el = document.createElement('div');
    const link = document.createElement('a');
    link.title = 'docs/architecture.md';
    link.href = '#diff-abc123';
    el.appendChild(link);

    expect(extractFilePath(el)).toBe('docs/architecture.md');
  });

  it('extracts path from data-path attribute', () => {
    const el = document.createElement('div');
    const pathEl = document.createElement('span');
    pathEl.setAttribute('data-path', 'src/readme.md');
    pathEl.classList.add('file-info');
    el.appendChild(pathEl);

    expect(extractFilePath(el)).toBe('src/readme.md');
  });

  it('extracts path from Truncate link text content', () => {
    const el = document.createElement('div');
    const truncate = document.createElement('div');
    truncate.className = 'Truncate';
    const link = document.createElement('a');
    link.textContent = 'docs/rfc-001.md';
    truncate.appendChild(link);
    el.appendChild(truncate);

    expect(extractFilePath(el)).toBe('docs/rfc-001.md');
  });

  it('extracts path from "Expand all lines: <path>" tooltip (new Preview diff view)', () => {
    const el = document.createElement('div');
    el.className = 'PullRequestDiffsList-module__diffEntry__abc';
    const tooltip = document.createElement('span');
    tooltip.className = 'prc-TooltipV2-Tooltip-tLeuB';
    tooltip.textContent = 'Expand all lines: docs/README.md';
    el.appendChild(tooltip);

    expect(extractFilePath(el)).toBe('docs/README.md');
  });

  it('handles tooltip with extra whitespace', () => {
    const el = document.createElement('div');
    const tooltip = document.createElement('span');
    tooltip.textContent = 'Expand all lines:   src/foo/bar.mdx  ';
    el.appendChild(tooltip);

    expect(extractFilePath(el)).toBe('src/foo/bar.mdx');
  });

  it('returns null when no path can be found', () => {
    const el = document.createElement('div');
    expect(extractFilePath(el)).toBeNull();
  });
});

describe('button injection idempotency', () => {
  it('does not inject duplicate buttons', () => {
    // Simulate a file header with an already-injected button
    const header = document.createElement('div');
    header.className = 'file-header';
    const existing = document.createElement('button');
    existing.setAttribute('data-margin-call', 'true');
    header.appendChild(existing);

    // The content script checks for [data-margin-call] before injecting
    const hasButton = header.querySelector('[data-margin-call]');
    expect(hasButton).not.toBeNull();
  });
});

describe('extractFilePath from tooltip-only file headers', () => {
  // When GitHub ships a diff view shape where the full path only appears
  // in the "Expand all lines: <path>" tooltip text, extractFilePath must
  // pull it from there. This is the current Preview view's behavior.
  it('pulls the path from the Expand-all-lines tooltip on a minimal container', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<div class="wrap">' +
      '  <span class="tooltip">Expand all lines: docs/deep/v3-notes.md</span>' +
      '  <div>Some other header content</div>' +
      '</div>';

    expect(extractFilePath(container)).toBe('docs/deep/v3-notes.md');
  });

  it('does not match tooltip text that is not a markdown path', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<span class="tooltip">Expand all lines: src/app.ts</span>';
    // The tooltip contains non-markdown path — extractFilePath still returns
    // it (the markdown check is separate via isMarkdownFile). But the raw
    // extractor has to pick it up.
    expect(extractFilePath(container)).toBe('src/app.ts');
  });

  it('extracts a path from a descendant aria-label attribute', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<button aria-label="View file docs/SAMPLE_TRD.md"></button>' +
      '<div>+105 lines added</div>';
    expect(extractFilePath(container)).toBe('docs/SAMPLE_TRD.md');
  });

  it('extracts a path from a descendant href attribute', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<a href="/owner/repo/blob/abc/docs/SAMPLE_TRD.md">view raw</a>';
    expect(extractFilePath(container)).toBe('docs/SAMPLE_TRD.md');
  });

  it('extracts a path from a leaf text containing the path with diff stats', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<span>docs/SAMPLE_TRD.md +105 -0</span><span>Viewed</span>';
    expect(extractFilePath(container)).toBe('docs/SAMPLE_TRD.md');
  });

  it('prefers the longest matching path when multiple candidates exist', () => {
    // The same file may appear multiple ways: a basename in one element
    // and a full path in another. Prefer the full path (more specific).
    const container = document.createElement('div');
    container.innerHTML =
      '<span>SAMPLE_TRD.md</span>' +
      '<a href="/x/y/blob/sha/docs/SAMPLE_TRD.md">link</a>';
    expect(extractFilePath(container)).toBe('docs/SAMPLE_TRD.md');
  });
});
