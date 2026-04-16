/**
 * Content script — injected into GitHub PR pages.
 * Detects markdown files in the diff and adds a "Review Preview" button
 * to each. Handles GitHub's Turbo SPA navigation by re-running on URL changes.
 */

const BUTTON_CLASS = 'margin-call-review-btn';
const BUTTON_ATTR = 'data-margin-call';
const LOG_PREFIX = '[Margin Call]';

/** Parse owner/repo/pull from a GitHub PR URL. */
export function parsePrUrl(
  url: string
): { owner: string; repo: string; pull: number } | null {
  const match = url.match(
    /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/
  );
  if (!match) return null;
  return { owner: match[1], repo: match[2], pull: parseInt(match[3], 10) };
}

/** Extract the file path from a GitHub file container element. */
export function extractFilePath(fileHeader: Element): string | null {
  // Classic GitHub: data-tagsearch-path attribute on the wrapper
  const pathAttr = fileHeader.getAttribute('data-tagsearch-path');
  if (pathAttr) return pathAttr;

  // New ""Preview"" diff view: the only place the FULL path appears is the
  // ""Expand all lines: <path>"" tooltip text. The visible text shows only
  // the basename. Search descendants for that pattern.
  const candidates = fileHeader.querySelectorAll('span, div');
  for (const el of candidates) {
    if (el.children.length > 0) continue; // leaf nodes only
    const txt = el.textContent?.trim() ?? '';
    const m = txt.match(/^Expand all lines:\s*(.+)$/);
    if (m && m[1]) return m[1];
  }

  // Older / alternative DOM shapes (legacy split/unified diff)
  const link = fileHeader.querySelector<HTMLAnchorElement>(
    'a[title], a[href*="#diff-"]'
  );
  if (link?.title) return link.title;

  const pathEl = fileHeader.querySelector(
    '[data-path], .file-info a, .Truncate a, [title$=".md"], [title$=".mdx"], [title$=".markdown"]'
  );
  if (pathEl) {
    const dataPath = pathEl.getAttribute('data-path');
    if (dataPath) return dataPath;
    const title = pathEl.getAttribute('title');
    if (title) return title;
    return pathEl.textContent?.trim() ?? null;
  }
  return null;
}

/** Check if a file path is a markdown file. */
export function isMarkdownFile(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.endsWith('.md') ||
    lower.endsWith('.mdx') ||
    lower.endsWith('.markdown')
  );
}

/** Create the "Review Preview" button element. */
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
    // Content scripts cannot call chrome.tabs.create directly — message
    // the background service worker, which has access to chrome.tabs.
    void chrome.runtime.sendMessage({ type: 'openPanel', url: panelUrl });
  });
  return btn;
}

interface FileContainerMatch {
  container: Element;
  /** The path extracted when we matched this container, or null if it has to be re-derived via extractFilePath. */
  knownPath: string | null;
}

/**
 * Find all file containers in the diff view. Two strategies:
 *
 * 1. Known selectors: GitHub's stable (current + legacy) DOM markers.
 *    When GitHub ships a new diff view shape, this list goes stale.
 *
 * 2. Leaf-walk fallback: find every leaf element whose visible text looks
 *    like a markdown file path, then walk up to the nearest ancestor that
 *    represents a "file row" (substantial height + contains other content
 *    beyond the path). This is resilient to class-name changes because it
 *    only looks at DOM shape, not specific classes.
 *
 * Known selectors run first; the fallback only fires if they produced nothing.
 */
function findFileContainers(): FileContainerMatch[] {
  const selectorGroups = [
    // New "Preview" diff view (React, CSS Modules with hashed class names)
    '[class*="PullRequestDiffsList-module__diffEntry"]',
    // Classic file wrapper with path-as-attribute
    '[data-tagsearch-path]',
    // Other newer containers
    '[data-details-container-group="file"]',
    'copilot-diff-entry',
    // Legacy wrapper
    '.file',
  ];
  const seen = new Set<Element>();
  const matches: FileContainerMatch[] = [];
  for (const sel of selectorGroups) {
    for (const el of document.querySelectorAll(sel)) {
      if (!seen.has(el)) {
        seen.add(el);
        matches.push({ container: el, knownPath: null });
      }
    }
  }

  if (matches.length > 0) return matches;

  // Fallback: find markdown-looking leaf elements and walk up to the
  // nearest "file row" ancestor.
  const mdLeaves = findMarkdownPathLeaves();
  let fallbackSucceeded = 0;
  let fallbackFailed = 0;
  for (const { leaf, path } of mdLeaves) {
    const container = walkToContainer(leaf);
    if (container && !seen.has(container)) {
      seen.add(container);
      matches.push({ container, knownPath: path });
      fallbackSucceeded++;
    } else if (!container) {
      fallbackFailed++;
    }
  }
  if (mdLeaves.length > 0) {
    console.log(
      `${LOG_PREFIX} fallback leaf-walk: ${fallbackSucceeded} container(s) found, ${fallbackFailed} leaf(s) had no viable ancestor, ${mdLeaves.length - fallbackSucceeded - fallbackFailed} duplicate(s) skipped`
    );
  }

  return matches;
}

interface MarkdownLeaf {
  leaf: Element;
  path: string;
}

/**
 * Find every leaf element (no children) whose visible text looks like a
 * markdown file path. Returns the leaf + extracted path.
 *
 * We accept two shapes of leaf text:
 *   - "Path/To/File.md" — bare filename (classic diff view)
 *   - "Expand all lines: Path/To/File.md" — tooltip content on the
 *     new Preview view (leaf is usually a hidden tooltip span)
 */
function findMarkdownPathLeaves(): MarkdownLeaf[] {
  const MD_EXT = /\.(md|mdx|markdown)$/i;
  const EXPAND = /^Expand all lines:\s*(.+\.(?:md|mdx|markdown))$/i;
  const results: MarkdownLeaf[] = [];
  const seenPaths = new Set<string>();

  for (const el of document.querySelectorAll<HTMLElement>(
    'span, a, div, strong'
  )) {
    if (el.children.length > 0) continue;
    const txt = (el.textContent ?? '').trim();
    if (!txt || txt.length > 300) continue;

    let path: string | null = null;
    const expandMatch = txt.match(EXPAND);
    if (expandMatch) {
      path = expandMatch[1].trim();
    } else if (MD_EXT.test(txt) && !txt.includes(' ') && !txt.includes('\n')) {
      // Bare path — no whitespace, ends in a markdown extension
      path = txt;
    }
    if (!path) continue;

    if (seenPaths.has(path)) continue;
    seenPaths.add(path);
    results.push({ leaf: el, path });
  }
  return results;
}

/**
 * From a markdown-path leaf, walk up to the nearest ancestor that looks
 * like a "file row" container. Uses three tiers of increasingly lenient
 * heuristics, so the button appears even when GitHub ships a collapsed
 * or minimally-populated file header.
 */
function walkToContainer(leaf: Element): Element | null {
  return (
    walkToContainerByDiffBody(leaf) ??
    walkToContainerBySize(leaf) ??
    walkToContainerByDepth(leaf)
  );
}

/**
 * Tier 1: walk up until an ancestor contains materially more text than
 * the leaf — indicating it wraps the filename AND the diff body.
 * Works when the file is expanded and the diff hunks are in the DOM.
 */
function walkToContainerByDiffBody(leaf: Element): Element | null {
  const leafText = (leaf.textContent ?? '').trim();
  const minTextLen = Math.max(leafText.length * 3, 40);

  let cur: Element | null = leaf.parentElement;
  for (let i = 0; i < 10 && cur; i++) {
    if (isPageRoot(cur)) return null;
    const rect = cur.getBoundingClientRect?.();
    const textLen = (cur.textContent ?? '').trim().length;
    if (
      rect &&
      rect.height >= 40 &&
      textLen >= minTextLen &&
      rect.height < Math.max(window.innerHeight * 4, 2000)
    ) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

/**
 * Tier 2: walk up to the first row-sized block element. Works when the
 * file header is rendered but the diff body is virtualized / collapsed,
 * so there's not much extra text around the filename.
 */
function walkToContainerBySize(leaf: Element): Element | null {
  let cur: Element | null = leaf.parentElement;
  for (let i = 0; i < 10 && cur; i++) {
    if (isPageRoot(cur)) return null;
    const rect = cur.getBoundingClientRect?.();
    if (rect && rect.width >= 300 && rect.height >= 20) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

/**
 * Tier 3: just grab an ancestor a few levels up. Works when getBoundingClientRect
 * returns zeros (mid-render, collapsed containers) — the button might look
 * a little awkward but at least it appears and is clickable.
 */
function walkToContainerByDepth(leaf: Element): Element | null {
  let cur: Element | null = leaf.parentElement;
  let picked: Element | null = null;
  for (let i = 0; i < 4 && cur; i++) {
    if (isPageRoot(cur)) break;
    picked = cur;
    cur = cur.parentElement;
  }
  return picked;
}

function isPageRoot(el: Element): boolean {
  return (
    el === document.body ||
    el === document.documentElement ||
    el.tagName === 'MAIN' ||
    el.tagName === 'BODY' ||
    el.tagName === 'HTML'
  );
}

/**
 * Find the action-bar element inside a file container where the button
 * should be inserted. Falls back to the container itself.
 */
function findActionBar(container: Element): Element {
  return (
    // New "Preview" diff view: file header is the prominent bar with
    // the path + actions. Inject the button at the start of it.
    container.querySelector('[class*="DiffFileHeader-module__diff-file-header"]') ??
    container.querySelector('[class*="file-header"]') ??
    container.querySelector('.file-actions') ??
    container.querySelector('.js-file-header-dropdown') ??
    container.querySelector('[data-component="PR_FileActions"]') ??
    container.querySelector('.file-header') ??
    container
  );
}

/**
 * Diagnostic: dump info about candidate selectors and where the
 * `docs/README.md` (or any visible markdown file path) lives in the DOM.
 * Runs once per URL change and is cheap. Helps debug DOM mismatches
 * when buttons fail to inject.
 */
function logDomDiagnostic(): void {
  const selectors = [
    'copilot-diff-entry',
    '[data-tagsearch-path]',
    '[data-details-container-group="file"]',
    '.file',
    '[data-testid="file-row"]',
    '[data-testid*="file"]',
    '[role="region"]',
  ];
  const counts = selectors.map((s) => ({
    selector: s,
    count: document.querySelectorAll(s).length,
  }));
  console.log(`${LOG_PREFIX} selector counts:`, counts);

  // Find any element whose text is a path ending in .md/.mdx/.markdown
  const all = [...document.querySelectorAll('*')];
  const mdLeaves = all.filter((el) => {
    const txt = el.textContent?.trim() ?? '';
    return (
      el.children.length === 0 &&
      /\.(md|mdx|markdown)$/i.test(txt) &&
      txt.length < 200
    );
  });
  console.log(
    `${LOG_PREFIX} found ${mdLeaves.length} leaf element(s) whose text is a markdown path`
  );

  for (const leaf of mdLeaves.slice(0, 3)) {
    const chain: Array<Record<string, string>> = [];
    let cur: Element | null = leaf;
    for (let i = 0; i < 8 && cur; i++) {
      chain.push({
        tag: cur.tagName,
        cls: cur.className?.toString?.() || '',
        testid: cur.getAttribute('data-testid') || '',
        component: cur.getAttribute('data-component') || '',
        tagsearchPath: cur.getAttribute('data-tagsearch-path') || '',
      });
      cur = cur.parentElement;
    }
    console.log(
      `${LOG_PREFIX} ancestor chain for "${leaf.textContent?.trim()}":`,
      chain
    );
  }
}

let diagnosticLogged = '';

/** Inject buttons into all visible markdown file headers. */
function injectButtons(): void {
  const prInfo = parsePrUrl(window.location.href);
  if (!prInfo) return;

  // Log DOM diagnostic once per URL — invaluable for debugging selector mismatches.
  if (diagnosticLogged !== window.location.href) {
    diagnosticLogged = window.location.href;
    // Defer slightly so React/Turbo has time to render
    setTimeout(logDomDiagnostic, 1500);
  }

  const matches = findFileContainers();
  if (matches.length === 0) {
    return;
  }

  let injected = 0;
  let skippedExisting = 0;
  let skippedNonMarkdown = 0;
  let usedFallback = false;

  for (const { container, knownPath } of matches) {
    if (container.querySelector(`[${BUTTON_ATTR}]`)) {
      skippedExisting++;
      continue;
    }

    const filePath = knownPath ?? extractFilePath(container);
    if (!filePath) continue;

    if (!isMarkdownFile(filePath)) {
      skippedNonMarkdown++;
      continue;
    }

    if (knownPath !== null) {
      // Container came from the leaf-walk fallback, not a known selector
      usedFallback = true;
    }

    const btn = createReviewButton(
      prInfo.owner,
      prInfo.repo,
      prInfo.pull,
      filePath
    );

    const target = findActionBar(container);
    target.prepend(btn);
    injected++;
  }

  if (injected > 0) {
    const suffix = usedFallback
      ? ' [fallback: ancestor-walk — known selectors matched nothing]'
      : '';
    console.log(
      `${LOG_PREFIX} injected ${injected} Review Preview button(s) ` +
        `(${skippedExisting} already present, ${skippedNonMarkdown} non-markdown files skipped)${suffix}`
    );
  } else if (matches.length > 0) {
    console.debug(
      `${LOG_PREFIX} no markdown files found among ${matches.length} file container(s)`
    );
  }
}

console.log(
  `${LOG_PREFIX} content script loaded on ${window.location.href}`
);

// Initial pass
injectButtons();

// GitHub Turbo navigation: URL changes without a full page load.
// MutationObserver catches both lazy-loaded file headers and Turbo nav DOM swaps.
const observer = new MutationObserver(() => {
  injectButtons();
});
observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Also re-run when Turbo finishes a navigation event.
document.addEventListener('turbo:render', () => {
  injectButtons();
});
document.addEventListener('turbo:load', () => {
  injectButtons();
});
