import { setToken, clearToken, setUser, getToken, getUser } from '../shared/storage.js';

// TODO: Replace with your GitHub OAuth App credentials after first extension load.
// See docs/DEVELOPMENT.md for setup instructions.
const CLIENT_ID = '__GITHUB_CLIENT_ID__';
const CLIENT_SECRET = '__GITHUB_CLIENT_SECRET__';
const SCOPES = 'repo';

interface AuthMessage {
  type: 'startAuth' | 'logout' | 'getAuthState';
}

interface AuthStateResponse {
  authenticated: boolean;
  user: { login: string; avatar_url: string } | null;
}

async function startAuth(): Promise<AuthStateResponse> {
  const redirectUri = chrome.identity.getRedirectURL('callback');
  const authUrl =
    `https://github.com/login/oauth/authorize` +
    `?client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(SCOPES)}`;

  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl,
    interactive: true,
  });

  if (!responseUrl) {
    throw new Error('Auth flow was cancelled');
  }

  const url = new URL(responseUrl);
  const code = url.searchParams.get('code');
  if (!code) {
    throw new Error('No authorization code received');
  }

  // Exchange code for access token
  const tokenResponse = await fetch(
    'https://github.com/login/oauth/access_token',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
      }),
    }
  );

  if (!tokenResponse.ok) {
    throw new Error(`Token exchange failed: ${tokenResponse.status}`);
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (tokenData.error || !tokenData.access_token) {
    throw new Error(
      tokenData.error_description ?? tokenData.error ?? 'Token exchange failed'
    );
  }

  await setToken(tokenData.access_token);

  // Fetch user info
  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/vnd.github+json',
    },
  });

  if (!userResponse.ok) {
    throw new Error(`Failed to fetch user info: ${userResponse.status}`);
  }

  const userData = (await userResponse.json()) as {
    login: string;
    avatar_url: string;
  };
  const user = { login: userData.login, avatar_url: userData.avatar_url };
  await setUser(user);

  return { authenticated: true, user };
}

async function logout(): Promise<AuthStateResponse> {
  await clearToken();
  return { authenticated: false, user: null };
}

async function getAuthState(): Promise<AuthStateResponse> {
  const token = await getToken();
  if (!token) {
    return { authenticated: false, user: null };
  }
  const user = await getUser();
  return { authenticated: true, user };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const msg = message as AuthMessage;

  const handle = async (): Promise<AuthStateResponse> => {
    switch (msg.type) {
      case 'startAuth':
        return startAuth();
      case 'logout':
        return logout();
      case 'getAuthState':
        return getAuthState();
      default:
        throw new Error(`Unknown message type: ${(msg as { type: string }).type}`);
    }
  };

  handle()
    .then((response) => sendResponse(response))
    .catch((error) =>
      sendResponse({
        authenticated: false,
        user: null,
        error: (error as Error).message,
      })
    );

  // Return true to indicate async sendResponse
  return true;
});
