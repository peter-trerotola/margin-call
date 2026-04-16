import { fetchPrInfo, fetchFileContent, fetchPrFiles } from './github-api.js';
import { renderMarkdown } from './renderer.js';

/** Parse query params from the current URL. */
function getParams(): {
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
    throw new Error('Missing required query params: owner, repo, pull, path');
  }

  return { owner, repo, pull: parseInt(pull, 10), path };
}

async function init() {
  const contentEl = document.getElementById('markdown-content')!;
  const prTitleEl = document.getElementById('pr-title')!;
  const prLinkEl = document.getElementById('pr-link') as HTMLAnchorElement;
  const filePathEl = document.getElementById('file-path')!;

  try {
    const { owner, repo, pull, path } = getParams();

    contentEl.innerHTML = '<p>Loading...</p>';
    filePathEl.textContent = path;

    // Fetch PR info and file content in parallel
    const [prInfo, content] = await Promise.all([
      fetchPrInfo(owner, repo, pull),
      (async () => {
        // Need head SHA for content fetch — get PR info first
        const pr = await fetchPrInfo(owner, repo, pull);
        return fetchFileContent(owner, repo, path, pr.head_sha);
      })(),
    ]);

    prTitleEl.textContent = `#${prInfo.number} ${prInfo.title}`;
    prLinkEl.href = prInfo.html_url;
    document.title = `${path} — Margin Call`;

    // Render markdown
    const html = renderMarkdown(content);
    contentEl.innerHTML = html;

    // TODO Phase 4: Initialize selection handler
    // TODO Phase 4: Fetch and parse diff for commentable lines
    // TODO Phase 5: Fetch and display existing comments
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : 'An unknown error occurred';
    contentEl.innerHTML = `<div class="error-state"><p>${msg}</p></div>`;
  }
}

init();
