/**
 * Content script — injected into GitHub PR "Files changed" pages.
 * Detects markdown files and adds a "Review Preview" button to each.
 */

const BUTTON_CLASS = 'margin-call-review-btn';
const BUTTON_ATTR = 'data-margin-call';

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
  // GitHub puts the file path in a link or a copyable element in the file header
  const link = fileHeader.querySelector<HTMLAnchorElement>(
    'a[title], a[href*="#diff-"]'
  );
  if (link?.title) return link.title;

  // Fallback: look for the text content of the file path element
  const pathEl = fileHeader.querySelector(
    '[data-path], .file-info a, .Truncate a'
  );
  if (pathEl) {
    const dataPath = pathEl.getAttribute('data-path');
    if (dataPath) return dataPath;
    return pathEl.textContent?.trim() ?? null;
  }
  return null;
}

/** Check if a file path is a markdown file. */
export function isMarkdownFile(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.mdx') || lower.endsWith('.markdown');
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
    chrome.tabs.create({ url: panelUrl });
  });
  return btn;
}

/** Inject buttons into all visible markdown file headers. */
function injectButtons() {
  const prInfo = parsePrUrl(window.location.href);
  if (!prInfo) return;

  // GitHub file headers — look for various selectors GitHub uses
  const fileHeaders = document.querySelectorAll(
    '.file-header, [data-tagsearch-path]'
  );

  for (const header of fileHeaders) {
    // Skip if already injected
    if (header.querySelector(`[${BUTTON_ATTR}]`)) continue;

    const filePath =
      header.getAttribute('data-tagsearch-path') ??
      extractFilePath(header);

    if (!filePath || !isMarkdownFile(filePath)) continue;

    const btn = createReviewButton(
      prInfo.owner,
      prInfo.repo,
      prInfo.pull,
      filePath
    );

    // Insert the button into the file actions area
    const actionsBar = header.querySelector(
      '.file-actions, .js-file-header-dropdown'
    );
    if (actionsBar) {
      actionsBar.prepend(btn);
    } else {
      header.appendChild(btn);
    }
  }
}

// Run on initial load
injectButtons();

// Watch for dynamically loaded file headers (GitHub lazy-loads them)
const observer = new MutationObserver(() => {
  injectButtons();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});
