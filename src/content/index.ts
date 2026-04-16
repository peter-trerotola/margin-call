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

/**
 * Strategy for finding file containers in a GitHub PR diff view:
 *
 * 1. **Known selectors** (`findKnownContainers`): GitHub's stable DOM
 *    markers (current + legacy). When GitHub ships a new view shape,
 *    this list goes stale.
 *
 * 2. **Leaf-walk fallback** (`findMarkdownPathLeaves` + `walkToContainer`):
 *    find every leaf element whose visible text looks like a markdown file
 *    path, then walk up to the nearest ancestor that represents a "file row"
 *    (substantial size, not the whole page). Resilient to class-name changes
 *    because it only uses DOM shape.
 *
 * `injectButtons` runs both paths on every invocation so we cover both
 * markdown files in known-shaped containers AND markdown files whose
 * containers are currently missed by the hardcoded selectors.
 */

interface MarkdownLeaf {
  leaf: Element;
  path: string;
}

/**
 * Find every leaf element (no children) whose visible text contains a
 * markdown file path. Three matchers, tried in order of specificity:
 *
 *   1. "Expand all lines: <path>" — tooltip on the new Preview view
 *   2. Bare path, no whitespace ("docs/readme.md")
 *   3. Path token embedded in text ("docs/readme.md +28 -9", "Viewed docs/readme.md")
 *
 * Returns ALL matching leaves with no de-dup by path — duplicates may be the
 * same path appearing in the file-tree sidebar AND the diff content header,
 * and we need to keep both so the caller can pick the content-area one.
 */
function findMarkdownPathLeaves(): MarkdownLeaf[] {
  const MD_EXT = /\.(md|mdx|markdown)$/i;
  const EXPAND = /^Expand all lines:\s*(.+\.(?:md|mdx|markdown))$/i;
  // A path-shaped token (no whitespace) ending in a markdown extension.
  // Bounded by start/whitespace on the left so we don't match parts of words.
  const PATH_TOKEN =
    /(?:^|\s)([^\s/]+(?:\/[^\s/]+)*\.(?:md|mdx|markdown))(?:\s|$)/i;
  const results: MarkdownLeaf[] = [];

  for (const el of document.querySelectorAll<HTMLElement>(
    'span, a, div, strong, code'
  )) {
    if (el.children.length > 0) continue;
    const txt = (el.textContent ?? '').trim();
    if (!txt || txt.length > 200) continue;

    let path: string | null = null;
    const expandMatch = txt.match(EXPAND);
    if (expandMatch) {
      path = expandMatch[1].trim();
    } else if (MD_EXT.test(txt) && !/\s/.test(txt)) {
      path = txt;
    } else {
      const tokenMatch = (' ' + txt).match(PATH_TOKEN);
      if (tokenMatch) path = tokenMatch[1];
    }
    if (!path) continue;
    results.push({ leaf: el, path });
  }
  return results;
}

/** Width below which an ancestor is treated as a sidebar/file-tree (skip it). */
const SIDEBAR_WIDTH_THRESHOLD = 400;

/**
 * Skip leaves that live inside a sidebar/file-tree panel — those have the
 * same filename text as the diff's file header but injecting there puts the
 * button in the wrong place. We climb up to the nearest sized ancestor and
 * if it's narrower than SIDEBAR_WIDTH_THRESHOLD, the leaf is sidebar-bound.
 */
function isInSidebar(leaf: Element): boolean {
  let cur: Element | null = leaf;
  for (let i = 0; i < 12 && cur; i++) {
    if (isPageRoot(cur)) return false;
    const rect = cur.getBoundingClientRect?.();
    if (rect && rect.width > 0 && rect.height > 0) {
      // First sized ancestor — if it's narrow, the leaf is in a sidebar.
      // Tolerate slightly wider sidebars (file-tree panels can be ~400px
      // when expanded), but anything sub-400 is almost certainly not the
      // diff content area.
      return rect.width < SIDEBAR_WIDTH_THRESHOLD;
    }
    cur = cur.parentElement;
  }
  return false;
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

// Throttle: only log a status line when the SITUATION changes, not on
// every MutationObserver tick. Keeps the console readable while still
// surfacing every distinct state.
let lastStatusKey = '';

/** Inject buttons into all visible markdown file headers. */
function injectButtons(): void {
  const prInfo = parsePrUrl(window.location.href);
  if (!prInfo) return;

  // Log DOM diagnostic once per URL — invaluable for debugging selector mismatches.
  if (diagnosticLogged !== window.location.href) {
    diagnosticLogged = window.location.href;
    setTimeout(logDomDiagnostic, 1500);
  }

  // Phase 1: try known selectors
  const knownMatches = findKnownContainers();
  let knownInjected = 0;
  let knownExisting = 0;
  let knownNoPath = 0;
  let knownNonMd = 0;

  for (const container of knownMatches) {
    if (container.querySelector(`[${BUTTON_ATTR}]`)) {
      knownExisting++;
      continue;
    }
    const filePath = extractFilePath(container);
    if (!filePath) {
      knownNoPath++;
      continue;
    }
    if (!isMarkdownFile(filePath)) {
      knownNonMd++;
      continue;
    }
    injectInto(container, filePath, prInfo);
    knownInjected++;
  }

  // Phase 2: leaf-walk fallback. The same path can appear as a leaf in
  // multiple places (file-tree sidebar AND diff content header). We split
  // leaves into content-area vs. sidebar buckets and prefer content-area
  // leaves; fall back to sidebar leaves only if no content-area ones exist
  // (better a button in a slightly wrong place than no button at all).
  const leaves = findMarkdownPathLeaves();
  const contentLeaves: MarkdownLeaf[] = [];
  const sidebarLeaves: MarkdownLeaf[] = [];
  for (const l of leaves) {
    if (!isMarkdownFile(l.path)) continue;
    if (isInSidebar(l.leaf)) sidebarLeaves.push(l);
    else contentLeaves.push(l);
  }
  const leavesToProcess =
    contentLeaves.length > 0 ? contentLeaves : sidebarLeaves;
  const usingSidebarFallback =
    contentLeaves.length === 0 && sidebarLeaves.length > 0;

  let fallbackInjected = 0;
  let fallbackNoContainer = 0;
  let fallbackAlreadyCovered = 0;
  const handledContainers = new Set<Element>();

  for (const { leaf, path } of leavesToProcess) {
    const alreadyInKnown = knownMatches.some((c) => c.contains(leaf));
    if (alreadyInKnown) {
      fallbackAlreadyCovered++;
      continue;
    }
    const container = walkToContainer(leaf);
    if (!container) {
      fallbackNoContainer++;
      continue;
    }
    if (handledContainers.has(container)) continue;
    handledContainers.add(container);
    if (container.querySelector(`[${BUTTON_ATTR}]`)) {
      continue;
    }
    injectInto(container, path, prInfo);
    fallbackInjected++;
  }

  const totalInjected = knownInjected + fallbackInjected;
  const statusKey = [
    knownMatches.length,
    knownInjected,
    knownNoPath,
    knownNonMd,
    knownExisting,
    contentLeaves.length,
    sidebarLeaves.length,
    fallbackInjected,
    fallbackNoContainer,
    fallbackAlreadyCovered,
    usingSidebarFallback ? 1 : 0,
  ].join(',');

  if (statusKey === lastStatusKey) return;
  lastStatusKey = statusKey;

  const sidebarSuffix = usingSidebarFallback
    ? ' [SIDEBAR FALLBACK — no content-area leaves found]'
    : '';
  const parts = [
    `known(matches=${knownMatches.length}, injected=${knownInjected}, no_path=${knownNoPath}, non_md=${knownNonMd}, existing=${knownExisting})`,
    `fallback(content_leaves=${contentLeaves.length}, sidebar_leaves=${sidebarLeaves.length}, injected=${fallbackInjected}, no_container=${fallbackNoContainer}, already_covered=${fallbackAlreadyCovered})`,
    `→ total=${totalInjected}${sidebarSuffix}`,
  ];
  console.log(`${LOG_PREFIX} inject: ${parts.join('  ')}`);
}

/** Inject a Review Preview button into the action bar of a container. */
function injectInto(
  container: Element,
  filePath: string,
  prInfo: { owner: string; repo: string; pull: number }
): void {
  const btn = createReviewButton(
    prInfo.owner,
    prInfo.repo,
    prInfo.pull,
    filePath
  );
  const target = findActionBar(container);
  target.prepend(btn);
}

/** Run ONLY the known-selector path (no leaf-walk). */
function findKnownContainers(): Element[] {
  const selectorGroups = [
    '[class*="PullRequestDiffsList-module__diffEntry"]',
    '[data-tagsearch-path]',
    '[data-details-container-group="file"]',
    'copilot-diff-entry',
    '.file',
  ];
  const seen = new Set<Element>();
  const containers: Element[] = [];
  for (const sel of selectorGroups) {
    for (const el of document.querySelectorAll(sel)) {
      if (!seen.has(el)) {
        seen.add(el);
        containers.push(el);
      }
    }
  }
  return containers;
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
