import {
  fetchPrInfo,
  fetchFileContent,
  fetchPrFiles,
  fetchPrComments,
} from './github-api.js';
import {
  renderMarkdown,
  buildLineRangeMap,
  markDiffState,
} from './renderer.js';
import { parseDiff } from './diff-parser.js';
import { setupReviewUI } from './review-ui.js';
import { renderMermaidBlocks } from './mermaid.js';

/** Parse query params from the current URL. */
export function getParams(): {
  owner: string;
  repo: string;
  pull: number;
  path: string;
} {
  const params = new URLSearchParams(window.location.search);
  const owner = params.get('owner');
  const repo = params.get('repo');
  const pull = params.get('pull');
  const path = params.get('path');

  if (!owner || !repo || !pull || !path) {
    throw new Error(
      'Missing required query params: owner, repo, pull, path'
    );
  }

  return { owner, repo, pull: parseInt(pull, 10), path };
}

async function init(): Promise<void> {
  const contentEl = document.getElementById(
    'markdown-content'
  ) as HTMLElement;
  const prTitleEl = document.getElementById('pr-title')!;
  const prLinkEl = document.getElementById('pr-link') as HTMLAnchorElement;
  const filePathEl = document.getElementById('file-path')!;
  const commentButton = document.getElementById(
    'comment-button'
  ) as HTMLButtonElement;
  const fileCommentsContainer = document.getElementById(
    'file-comments'
  ) as HTMLElement;

  try {
    const { owner, repo, pull, path } = getParams();

    contentEl.innerHTML = '<p class="loading">Loading...</p>';
    filePathEl.textContent = path;

    // PR metadata is needed first (for head_sha); everything else runs in parallel after.
    const prInfo = await fetchPrInfo(owner, repo, pull);
    prTitleEl.textContent = `#${prInfo.number} ${prInfo.title}`;
    prLinkEl.href = prInfo.html_url;
    document.title = `${path} — Margin Call`;

    const [content, prFiles, existingComments] = await Promise.all([
      fetchFileContent(owner, repo, path, prInfo.head_sha),
      fetchPrFiles(owner, repo, pull),
      fetchPrComments(owner, repo, pull, path),
    ]);

    // Render markdown (sanitized via DOMPurify in renderMarkdown)
    contentEl.innerHTML = renderMarkdown(content);

    // Replace fenced ```mermaid code blocks with rendered SVGs.
    // Done BEFORE buildLineRangeMap so the SVG wrappers (which carry the
    // source-line attrs) are part of the map.
    await renderMermaidBlocks(contentEl);

    const lineRanges = buildLineRangeMap(contentEl);

    // Compute commentable / added lines from this file's patch
    const thisFile = prFiles.find((f) => f.filename === path);
    const diffResult = parseDiff(thisFile?.patch);
    const { commentableLines, addedLines, added, removed } = diffResult;

    // Visually mark elements with additions / commentable status
    markDiffState(lineRanges, addedLines, commentableLines);

    // Render a legend bar so reviewers know what's what
    const legend = document.createElement('span');
    legend.className = 'diff-legend';
    legend.innerHTML =
      `<span class="diff-stat added">+${added}</span> ` +
      `<span class="diff-stat removed">−${removed}</span>` +
      ` <span class="diff-hint">Sections with a green border were added in this PR ` +
      `and can receive comments.</span>`;
    filePathEl.appendChild(legend);

    // Wire up selection → comment button → post comment, plus existing comments
    const ui = setupReviewUI({
      owner,
      repo,
      pull,
      path,
      commit_id: prInfo.head_sha,
      container: contentEl,
      commentButton,
      fileCommentsContainer,
      lineRanges,
      commentableLines,
    });

    ui.displayComments(existingComments);

    // Reveal the file-comments section if any file-level threads were rendered
    if (fileCommentsContainer.querySelector('.comment-thread')) {
      fileCommentsContainer.hidden = false;
    }
    // Also reveal it lazily as new file-level comments are posted
    new MutationObserver(() => {
      if (
        fileCommentsContainer.querySelector(
          '.comment-thread, .comment-form'
        )
      ) {
        fileCommentsContainer.hidden = false;
      }
    }).observe(fileCommentsContainer, { childList: true });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : 'An unknown error occurred';
    contentEl.innerHTML = `<div class="error-state"><p>${msg}</p></div>`;
  }
}

void init();
