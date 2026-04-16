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

export interface PostCommentParams {
  owner: string;
  repo: string;
  pull_number: number;
  body: string;
  commit_id: string;
  path: string;
  line: number;
  side: 'RIGHT' | 'LEFT';
  start_line?: number;
  start_side?: 'RIGHT' | 'LEFT';
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

export async function fetchPrComments(
  owner: string,
  repo: string,
  pull: number,
  filePath?: string
): Promise<ReviewComment[]> {
  const comments = await apiFetchAll<ReviewComment>(
    `/repos/${owner}/${repo}/pulls/${pull}/comments?per_page=100`
  );

  if (filePath) {
    return comments.filter((c) => c.path === filePath);
  }
  return comments;
}

export async function postComment(
  params: PostCommentParams
): Promise<ReviewComment> {
  const { owner, repo, pull_number, ...body } = params;

  const requestBody: Record<string, unknown> = {
    body: body.body,
    commit_id: body.commit_id,
    path: body.path,
    line: body.line,
    side: body.side,
  };

  if (body.start_line !== undefined) {
    requestBody.start_line = body.start_line;
    requestBody.start_side = body.start_side ?? body.side;
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
