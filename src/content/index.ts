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

/** Extract the file path from a GitHub file header element. */
export function extractFilePath(fileHeader: Element): string | null {
  // Modern GitHub puts the path in data-tagsearch-path on the file wrapper
  const pathAttr = fileHeader.getAttribute('data-tagsearch-path');
  if (pathAttr) return pathAttr;

  // Older / alternative DOM shapes
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
    void chrome.tabs.create({ url: panelUrl });
  });
  return btn;
}

/**
 * Find all file containers in the diff view. GitHub has used several DOM
 * shapes over the years and across views (split, unified, rich-diff). Try
 * the most-specific selectors first and fall back to broader ones.
 */
function findFileContainers(): Element[] {
  const selectorGroups = [
    '[data-tagsearch-path]', // most common modern marker — has path as attr
    '[data-details-container-group="file"]', // newer container
    '.file', // legacy wrapper
    'copilot-diff-entry', // GitHub's web component for diff entries
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

/**
 * Find the action-bar element inside a file container where the button
 * should be inserted. Falls back to the container itself.
 */
function findActionBar(container: Element): Element {
  return (
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

  const containers = findFileContainers();
  if (containers.length === 0) {
    return;
  }

  let injected = 0;
  let skippedExisting = 0;
  let skippedNonMarkdown = 0;

  for (const container of containers) {
    if (container.querySelector(`[${BUTTON_ATTR}]`)) {
      skippedExisting++;
      continue;
    }

    const filePath = extractFilePath(container);
    if (!filePath) continue;

    if (!isMarkdownFile(filePath)) {
      skippedNonMarkdown++;
      continue;
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
    console.log(
      `${LOG_PREFIX} injected ${injected} Review Preview button(s) ` +
        `(${skippedExisting} already present, ${skippedNonMarkdown} non-markdown files skipped)`
    );
  } else if (containers.length > 0) {
    console.debug(
      `${LOG_PREFIX} no markdown files found among ${containers.length} file container(s)`
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
