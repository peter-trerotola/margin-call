import { getToken } from '../shared/storage.js';

const API_BASE = 'https://api.github.com';

export interface PrInfo {
  title: string;
  number: number;
  head_sha: string;
  base_ref: string;
  html_url: string;
}

export interface PrFile {
  filename: string;
  status: string;
  patch?: string;
}

export interface ReviewComment {
  id: number;
  body: string;
  line: number | null;
  start_line: number | null;
  path: string;
  user: { login: string; avatar_url: string };
  created_at: string;
  in_reply_to_id?: number;
}

/**
 * GitHub PR review comments come in two shapes:
 *
 * - **Line-level**: anchored to a specific line that appears in the diff.
 *   Required: `line`, `side`. Optional `start_line`/`start_side` for ranges.
 *
 * - **File-level**: anchored to the whole file, no line number. Used as a
 *   fallback when the user selects text outside the diff hunks (the GitHub
 *   REST API rejects line comments outside the diff with HTTP 422 as of
 *   April 2026 — `subject_type: "file"` is the supported workaround).
 */
export type PostCommentParams =
  | PostLineCommentParams
  | PostFileCommentParams;

export interface PostLineCommentParams {
  owner: string;
  repo: string;
  pull_number: number;
  body: string;
  commit_id: string;
  path: string;
  subject_type?: 'line';
  line: number;
  side: 'RIGHT' | 'LEFT';
  start_line?: number;
  start_side?: 'RIGHT' | 'LEFT';
}

export interface PostFileCommentParams {
  owner: string;
  repo: string;
  pull_number: number;
  body: string;
  commit_id: string;
  path: string;
  subject_type: 'file';
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = await authHeaders();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string>) },
  });

  if (response.status === 401) {
    throw new Error('Authentication expired. Please sign in again.');
  }
  if (response.status === 403) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    if (remaining === '0') {
      throw new Error('GitHub API rate limit exceeded. Please wait and try again.');
    }
    throw new Error(`Access denied (403)`);
  }
  if (response.status === 404) {
    throw new Error('Not found. Check that the repository exists and you have access.');
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`GitHub API error ${response.status}: ${body}`);
  }

  return response.json() as Promise<T>;
}

/** Fetch all pages of a paginated GitHub API endpoint. */
async function apiFetchAll<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  let url: string | null = `${API_BASE}${path}`;
  const headers = await authHeaders();

  while (url) {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`GitHub API error ${response.status}`);
    }

    const data = (await response.json()) as T[];
    items.push(...data);

    // Parse Link header for next page
    const linkHeader = response.headers.get('Link');
    url = parseLinkHeader(linkHeader);
  }

  return items;
}

/** Parse the GitHub Link header to find the "next" URL. */
export function parseLinkHeader(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

export async function fetchPrInfo(
  owner: string,
  repo: string,
  pull: number
): Promise<PrInfo> {
  const data = await apiFetch<{
    title: string;
    number: number;
    head: { sha: string };
    base: { ref: string };
    html_url: string;
  }>(`/repos/${owner}/${repo}/pulls/${pull}`);

  return {
    title: data.title,
    number: data.number,
    head_sha: data.head.sha,
    base_ref: data.base.ref,
    html_url: data.html_url,
  };
}

export async function fetchPrFiles(
  owner: string,
  repo: string,
  pull: number
): Promise<PrFile[]> {
  return apiFetchAll<PrFile>(
    `/repos/${owner}/${repo}/pulls/${pull}/files?per_page=100`
  );
}

export async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<string> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(
    `${API_BASE}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${ref}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.raw+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.status}`);
  }

  return response.text();
}

/**
 * Fetch the set of root comment IDs whose threads have been resolved.
 * Uses the GraphQL API because the REST API doesn't expose resolution status.
 */
export async function fetchResolvedThreadRootIds(
  owner: string,
  repo: string,
  pull: number
): Promise<Set<number>> {
  const token = await getToken();
  if (!token) return new Set();

  const query = `{
    repository(owner: "${owner}", name: "${repo}") {
      pullRequest(number: ${pull}) {
        reviewThreads(first: 100) {
          nodes {
            isResolved
            comments(first: 1) {
              nodes { databaseId }
            }
          }
        }
      }
    }
  }`;

  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) return new Set();

    const data = (await response.json()) as {
      data?: {
        repository?: {
          pullRequest?: {
            reviewThreads?: {
              nodes?: Array<{
                isResolved: boolean;
                comments: { nodes: Array<{ databaseId: number }> };
              }>;
            };
          };
        };
      };
    };

    const threads =
      data.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];
    const resolvedIds = new Set<number>();
    for (const thread of threads) {
      if (thread.isResolved && thread.comments.nodes.length > 0) {
        resolvedIds.add(thread.comments.nodes[0].databaseId);
      }
    }
    return resolvedIds;
  } catch {
    return new Set();
  }
}

export async function fetchPrComments(
  owner: string,
  repo: string,
  pull: number,
  filePath?: string
): Promise<ReviewComment[]> {
  const [comments, resolvedIds] = await Promise.all([
    apiFetchAll<ReviewComment>(
      `/repos/${owner}/${repo}/pulls/${pull}/comments?per_page=100`
    ),
    fetchResolvedThreadRootIds(owner, repo, pull),
  ]);

  // Filter out resolved threads (root + all replies)
  const filtered = resolvedIds.size > 0
    ? comments.filter(
        (c) => !resolvedIds.has(c.id) && !resolvedIds.has(c.in_reply_to_id ?? -1)
      )
    : comments;

  if (filePath) {
    return filtered.filter((c) => c.path === filePath);
  }
  return comments;
}

export async function postComment(
  params: PostCommentParams
): Promise<ReviewComment> {
  const { owner, repo, pull_number } = params;

  let requestBody: Record<string, unknown>;

  if (params.subject_type === 'file') {
    // File-level comment: no line, anchored to the whole file.
    requestBody = {
      body: params.body,
      commit_id: params.commit_id,
      path: params.path,
      subject_type: 'file',
    };
  } else {
    // Line-level comment (default): must be on a line within the diff.
    requestBody = {
      body: params.body,
      commit_id: params.commit_id,
      path: params.path,
      line: params.line,
      side: params.side,
    };
    if (params.start_line !== undefined) {
      requestBody.start_line = params.start_line;
      requestBody.start_side = params.start_side ?? params.side;
    }
  }

  return apiFetch<ReviewComment>(
    `/repos/${owner}/${repo}/pulls/${pull_number}/comments`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    }
  );
}

export async function postReply(
  owner: string,
  repo: string,
  pull: number,
  commentId: number,
  body: string
): Promise<ReviewComment> {
  return apiFetch<ReviewComment>(
    `/repos/${owner}/${repo}/pulls/${pull}/comments/${commentId}/replies`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    }
  );
}
