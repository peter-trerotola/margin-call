/**
 * Content script — injected into GitHub PR "Files changed" / "changes" pages.
 * Detects markdown files and adds a "Review Preview" button next to each.
 */

const BUTTON_CLASS = 'margin-call-review-btn';
const BUTTON_ATTR = 'data-margin-call';
const LOG_PREFIX = '[Margin Call]';

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

/** Parse owner/repo/pull from a GitHub PR URL. */
export function parsePrUrl(
  url: string
): { owner: string; repo: string; pull: number } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2], pull: parseInt(match[3], 10) };
}

// ---------------------------------------------------------------------------
// Path extraction
// ---------------------------------------------------------------------------

/** Regex: a slash-separated token ending in a markdown extension. */
const PATH_TOKEN_RE =
  /(?:^|[\s/="<>])([\w.-]+(?:\/[\w.-]+)*\.(?:md|mdx|markdown))(?:[\s"<>]|$)/i;

/**
 * Strip GitHub URL prefixes like "owner/repo/blob/<sha>/" so we get
 * the repo-relative path the API expects.
 */
function stripGitHubUrlPrefix(raw: string): string {
  return raw.replace(/^[\w.-]+\/[\w.-]+\/(?:blob|raw|tree)\/[\w.-]+\//, '');
}

/**
 * Extract the file path from a container element. Tries specific GitHub
 * conventions first, then scans all descendant attributes and leaf text
 * for anything that looks like a markdown path.
 */
export function extractFilePath(container: Element): string | null {
  // data-tagsearch-path (classic GitHub)
  const tsPath = container.getAttribute('data-tagsearch-path');
  if (tsPath) return tsPath;

  // "Expand all lines: <path>" tooltip (Preview diff view)
  for (const el of container.querySelectorAll('span, div')) {
    if (el.children.length > 0) continue;
    const m = (el.textContent ?? '').trim().match(/^Expand all lines:\s*(.+)$/);
    if (m?.[1]) return m[1];
  }

  // Legacy: link with title or diff anchor
  const link = container.querySelector<HTMLAnchorElement>(
    'a[title], a[href*="#diff-"]'
  );
  if (link?.title) return link.title;

  // Last resort: scan ALL descendant attributes + leaf text
  const candidates: string[] = [];
  const attrs = ['title', 'aria-label', 'data-path', 'data-tagsearch-path',
    'href', 'data-tooltip-content'];
  for (const el of container.querySelectorAll<HTMLElement>('*')) {
    for (const attr of attrs) {
      const val = el.getAttribute(attr);
      if (!val) continue;
      const m = val.match(PATH_TOKEN_RE);
      if (m) candidates.push(stripGitHubUrlPrefix(m[1]));
    }
    if (el.children.length === 0) {
      const txt = (el.textContent ?? '').trim();
      if (txt && txt.length <= 200) {
        const m = (' ' + txt).match(PATH_TOKEN_RE);
        if (m) candidates.push(stripGitHubUrlPrefix(m[1]));
      }
    }
  }
  if (candidates.length === 0) return null;
  // Prefer deepest path (most directory segments = most specific)
  candidates.sort((a, b) => b.split('/').length - a.split('/').length || b.length - a.length);
  return candidates[0];
}

/** Check if a file path is a markdown file. */
export function isMarkdownFile(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.mdx') || lower.endsWith('.markdown');
}

// ---------------------------------------------------------------------------
// Button creation
// ---------------------------------------------------------------------------

function createReviewButton(
  owner: string,
  repo: string,
  pull: number,
  filePath: string
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = BUTTON_CLASS;
  btn.setAttribute(BUTTON_ATTR, 'true');
  btn.textContent = 'Review Preview';
  btn.title = 'Open rendered markdown with inline commenting';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const panelUrl = chrome.runtime.getURL(
      `panel/index.html?owner=${encodeURIComponent(owner)}` +
        `&repo=${encodeURIComponent(repo)}` +
        `&pull=${pull}` +
        `&path=${encodeURIComponent(filePath)}`
    );
    void chrome.runtime.sendMessage({ type: 'openPanel', url: panelUrl });
  });
  return btn;
}

// ---------------------------------------------------------------------------
// Container + action-bar discovery
// ---------------------------------------------------------------------------

/** Known selectors for file containers across GitHub's diff view variants. */
const CONTAINER_SELECTORS = [
  '[class*="PullRequestDiffsList-module__diffEntry"]',
  '[data-tagsearch-path]',
  '[data-details-container-group="file"]',
  'copilot-diff-entry',
  '.file',
];

/** Find the best place inside a container to prepend the button. */
function findActionBar(container: Element): Element {
  return (
    container.querySelector('[class*="DiffFileHeader-module__diff-file-header"]') ??
    container.querySelector('[class*="file-header"]') ??
    container.querySelector('.file-actions') ??
    container.querySelector('.file-header') ??
    container
  );
}

// ---------------------------------------------------------------------------
// Core: find containers → inject buttons (single unified path)
// ---------------------------------------------------------------------------

function injectButtons(): void {
  const prInfo = parsePrUrl(window.location.href);
  if (!prInfo) return;

  // Clean slate: remove ALL existing buttons. Re-inject fresh every time.
  // This eliminates every class of duplicate/stale button bug.
  for (const old of document.querySelectorAll(`[${BUTTON_ATTR}]`)) {
    old.remove();
  }

  // Find file containers via known selectors
  const seen = new Set<Element>();
  const containers: Array<{ el: Element; path: string }> = [];

  for (const sel of CONTAINER_SELECTORS) {
    for (const el of document.querySelectorAll(sel)) {
      if (seen.has(el)) continue;
      seen.add(el);
      const path = extractFilePath(el);
      if (path && isMarkdownFile(path)) {
        containers.push({ el, path });
      }
    }
  }

  // Inject
  for (const { el, path } of containers) {
    const target = findActionBar(el);
    target.prepend(createReviewButton(prInfo.owner, prInfo.repo, prInfo.pull, path));
  }

  if (containers.length > 0) {
    console.log(`${LOG_PREFIX} injected ${containers.length} button(s)`);
  }
}

// ---------------------------------------------------------------------------
// Lifecycle: debounced MutationObserver + Turbo events
// ---------------------------------------------------------------------------

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleInject(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(injectButtons, 300);
}

console.log(`${LOG_PREFIX} content script loaded on ${window.location.href}`);

// Initial inject (debounced so React has time to render)
scheduleInject();

// Re-inject on DOM changes (debounced to avoid firing on every mutation)
new MutationObserver(scheduleInject).observe(document.body, {
  childList: true,
  subtree: true,
});

// Turbo SPA navigation
document.addEventListener('turbo:render', scheduleInject);
document.addEventListener('turbo:load', scheduleInject);
