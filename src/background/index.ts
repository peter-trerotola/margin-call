import {
  setToken,
  clearToken,
  setUser,
  getToken,
  getUser,
} from '../shared/storage.js';

/**
 * GitHub OAuth via Device Flow — no client_secret required.
 *
 * Why: Chrome extensions are distributed as publicly downloadable zips, so
 * any bundled client_secret leaks. Device Flow uses only a client_id (public)
 * and a short user-entered verification code, avoiding the secret entirely.
 *
 * Flow:
 *   1. Extension POSTs to github.com/login/device/code → gets a device_code
 *      plus a short user_code and verification_uri.
 *   2. Extension opens the verification_uri in a tab; user enters user_code
 *      on github.com and authorizes.
 *   3. Extension polls github.com/login/oauth/access_token with the
 *      device_code until GitHub returns an access_token.
 *
 * The polling loop persists in chrome.storage.local so it survives service
 * worker restarts.
 */

// Replace with your GitHub OAuth App's client_id. No secret needed for
// device flow — client_id is public and safe to commit.
// See docs/DEVELOPMENT.md for OAuth App setup.
const CLIENT_ID = '__GITHUB_CLIENT_ID__';
const SCOPES = 'repo';

const PENDING_AUTH_KEY = 'pending_auth';

interface PendingAuth {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_at: number; // ms epoch
  interval: number; // seconds between polls
}

type AuthMessage =
  | { type: 'startAuth' }
  | { type: 'cancelAuth' }
  | { type: 'logout' }
  | { type: 'getAuthState' };

interface GitHubUser {
  login: string;
  avatar_url: string;
}

export interface AuthStateResponse {
  status: 'unauthenticated' | 'pending' | 'authenticated' | 'error';
  user: GitHubUser | null;
  user_code?: string;
  verification_uri?: string;
  verification_uri_complete?: string;
  expires_at?: number;
  error?: string;
}

let pollTimer: ReturnType<typeof setTimeout> | null = null;

async function getPendingAuth(): Promise<PendingAuth | null> {
  const stored = await chrome.storage.local.get(PENDING_AUTH_KEY);
  const pending = stored[PENDING_AUTH_KEY] as PendingAuth | undefined;
  return pending ?? null;
}

async function setPendingAuth(pending: PendingAuth): Promise<void> {
  await chrome.storage.local.set({ [PENDING_AUTH_KEY]: pending });
}

async function clearPendingAuth(): Promise<void> {
  await chrome.storage.local.remove(PENDING_AUTH_KEY);
}

async function fetchUserInfo(token: string): Promise<GitHubUser> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch user info: ${response.status}`);
  }
  const data = (await response.json()) as {
    login: string;
    avatar_url: string;
  };
  return { login: data.login, avatar_url: data.avatar_url };
}

function schedulePoll(delaySeconds: number): void {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(
    () => {
      void pollOnce();
    },
    Math.max(delaySeconds * 1000, 1000)
  );
}

async function pollOnce(): Promise<void> {
  pollTimer = null;
  const pending = await getPendingAuth();
  if (!pending) return;

  if (Date.now() > pending.expires_at) {
    await clearPendingAuth();
    return;
  }

  let data: {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  try {
    const response = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          device_code: pending.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      }
    );
    data = await response.json();
  } catch {
    // Network error — try again on the existing interval
    schedulePoll(pending.interval);
    return;
  }

  if (data.access_token) {
    await setToken(data.access_token);
    try {
      const user = await fetchUserInfo(data.access_token);
      await setUser(user);
    } catch {
      // Token is valid but user fetch failed — keep token, user fetch can retry later
    }
    await clearPendingAuth();
    return;
  }

  switch (data.error) {
    case 'authorization_pending':
      schedulePoll(pending.interval);
      return;
    case 'slow_down':
      // GitHub asks us to slow down — bump interval by 5s
      pending.interval += 5;
      await setPendingAuth(pending);
      schedulePoll(pending.interval);
      return;
    case 'expired_token':
    case 'access_denied':
    case 'incorrect_device_code':
    case 'unsupported_grant_type':
    case 'incorrect_client_credentials':
      await clearPendingAuth();
      return;
    default:
      // Unknown error — stop polling rather than loop forever
      await clearPendingAuth();
      return;
  }
}

async function startAuth(): Promise<AuthStateResponse> {
  // Cancel any in-flight auth
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  await clearPendingAuth();

  const response = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ client_id: CLIENT_ID, scope: SCOPES }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Device code request failed: ${response.status} ${body}`
    );
  }

  const data = (await response.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete?: string;
    expires_in: number;
    interval: number;
  };

  if (data.error || !data.device_code) {
    const err = data as unknown as {
      error?: string;
      error_description?: string;
    };
    throw new Error(
      err.error_description ?? err.error ?? 'Device code request failed'
    );
  }

  const pending: PendingAuth = {
    device_code: data.device_code,
    user_code: data.user_code,
    verification_uri: data.verification_uri,
    verification_uri_complete: data.verification_uri_complete,
    expires_at: Date.now() + data.expires_in * 1000,
    interval: data.interval,
  };
  await setPendingAuth(pending);

  // Open the verification page in a new tab. verification_uri_complete
  // pre-fills the user_code when supported.
  const verifyUrl = pending.verification_uri_complete ?? pending.verification_uri;
  void chrome.tabs.create({ url: verifyUrl });

  // Start polling
  schedulePoll(pending.interval);

  return {
    status: 'pending',
    user: null,
    user_code: pending.user_code,
    verification_uri: pending.verification_uri,
    verification_uri_complete: pending.verification_uri_complete,
    expires_at: pending.expires_at,
  };
}

async function cancelAuth(): Promise<AuthStateResponse> {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  await clearPendingAuth();
  return { status: 'unauthenticated', user: null };
}

async function logout(): Promise<AuthStateResponse> {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  await clearPendingAuth();
  await clearToken();
  return { status: 'unauthenticated', user: null };
}

async function getAuthState(): Promise<AuthStateResponse> {
  const token = await getToken();
  if (token) {
    const user = await getUser();
    return { status: 'authenticated', user };
  }

  const pending = await getPendingAuth();
  if (pending && Date.now() < pending.expires_at) {
    // Resume polling if the service worker was restarted and lost its timer
    if (!pollTimer) schedulePoll(pending.interval);
    return {
      status: 'pending',
      user: null,
      user_code: pending.user_code,
      verification_uri: pending.verification_uri,
      verification_uri_complete: pending.verification_uri_complete,
      expires_at: pending.expires_at,
    };
  }

  // Clean up expired pending auth
  if (pending) {
    await clearPendingAuth();
  }
  return { status: 'unauthenticated', user: null };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const msg = message as AuthMessage;

  const handle = async (): Promise<AuthStateResponse> => {
    switch (msg.type) {
      case 'startAuth':
        return startAuth();
      case 'cancelAuth':
        return cancelAuth();
      case 'logout':
        return logout();
      case 'getAuthState':
        return getAuthState();
      default:
        throw new Error(
          `Unknown message type: ${(msg as { type: string }).type}`
        );
    }
  };

  handle()
    .then((response) => sendResponse(response))
    .catch((error) =>
      sendResponse({
        status: 'error',
        user: null,
        error: (error as Error).message,
      })
    );

  return true; // async sendResponse
});
