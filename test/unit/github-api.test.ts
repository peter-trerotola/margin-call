import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseLinkHeader } from '../../src/panel/github-api.js';
import { setStorageData } from '../mocks/chrome.js';

describe('parseLinkHeader', () => {
  it('extracts the next URL from a Link header', () => {
    const header =
      '<https://api.github.com/repos/a/b/pulls/1/comments?page=2>; rel="next", ' +
      '<https://api.github.com/repos/a/b/pulls/1/comments?page=5>; rel="last"';
    expect(parseLinkHeader(header)).toBe(
      'https://api.github.com/repos/a/b/pulls/1/comments?page=2'
    );
  });

  it('returns null when there is no next link', () => {
    const header =
      '<https://api.github.com/repos/a/b/pulls/1/comments?page=1>; rel="prev"';
    expect(parseLinkHeader(header)).toBeNull();
  });

  it('returns null for null input', () => {
    expect(parseLinkHeader(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseLinkHeader('')).toBeNull();
  });
});

describe('GitHub API client', () => {
  beforeEach(() => {
    setStorageData({ github_token: 'gho_test_token' });
  });

  it('fetchPrInfo constructs the correct URL', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        title: 'Test PR',
        number: 42,
        head: { sha: 'abc123' },
        base: { ref: 'main' },
        html_url: 'https://github.com/owner/repo/pull/42',
      }),
      headers: new Headers(),
    }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { fetchPrInfo } = await import('../../src/panel/github-api.js');
    const result = await fetchPrInfo('owner', 'repo', 42);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo/pulls/42',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer gho_test_token',
        }),
      })
    );
    expect(result.title).toBe('Test PR');
    expect(result.head_sha).toBe('abc123');
  });

  it('throws on 401 with expiry message', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      headers: new Headers(),
    })) as unknown as typeof fetch;

    const { fetchPrInfo } = await import('../../src/panel/github-api.js');
    await expect(fetchPrInfo('o', 'r', 1)).rejects.toThrow('expired');
  });

  it('throws on 403 rate limit', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 403,
      headers: new Headers({ 'x-ratelimit-remaining': '0' }),
    })) as unknown as typeof fetch;

    const { fetchPrInfo } = await import('../../src/panel/github-api.js');
    await expect(fetchPrInfo('o', 'r', 1)).rejects.toThrow('rate limit');
  });

  it('throws on 404', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 404,
      headers: new Headers(),
    })) as unknown as typeof fetch;

    const { fetchPrInfo } = await import('../../src/panel/github-api.js');
    await expect(fetchPrInfo('o', 'r', 1)).rejects.toThrow('Not found');
  });

  it('throws when not authenticated', async () => {
    setStorageData({}); // No token

    const { fetchPrInfo } = await import('../../src/panel/github-api.js');
    await expect(fetchPrInfo('o', 'r', 1)).rejects.toThrow('Not authenticated');
  });

  it('postComment sends correct body for single-line comment', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: 1,
        body: 'Great point',
        line: 5,
        start_line: null,
        path: 'docs/rfc.md',
        user: { login: 'user', avatar_url: '' },
        created_at: '2026-01-01T00:00:00Z',
      }),
      headers: new Headers(),
    }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { postComment } = await import('../../src/panel/github-api.js');
    await postComment({
      owner: 'o',
      repo: 'r',
      pull_number: 1,
      body: 'Great point',
      commit_id: 'sha123',
      path: 'docs/rfc.md',
      line: 5,
      side: 'RIGHT',
    });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
    expect(callBody.line).toBe(5);
    expect(callBody.side).toBe('RIGHT');
    expect(callBody.start_line).toBeUndefined();
  });

  it('postComment sends correct body for multi-line comment', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 1 }),
      headers: new Headers(),
    }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { postComment } = await import('../../src/panel/github-api.js');
    await postComment({
      owner: 'o',
      repo: 'r',
      pull_number: 1,
      body: 'Range comment',
      commit_id: 'sha123',
      path: 'docs/rfc.md',
      line: 10,
      side: 'RIGHT',
      start_line: 7,
      start_side: 'RIGHT',
    });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
    expect(callBody.line).toBe(10);
    expect(callBody.start_line).toBe(7);
    expect(callBody.start_side).toBe('RIGHT');
  });
});
