import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getMessageListeners,
  setStorageData,
  getStorageData,
} from '../mocks/chrome.js';

// Import the background script to register the message listener
import '../../src/background/index.js';

/**
 * Simulate sending a message to the background service worker.
 * Triggers the registered onMessage listener and returns the response.
 */
function sendMessageToBackground(message: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    const listeners = getMessageListeners();
    expect(listeners.length).toBeGreaterThan(0);

    const listener = listeners[listeners.length - 1];
    listener(message, { id: 'test-popup' }, (response) => {
      resolve(response);
    });
  });
}

describe('OAuth flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAuthState', () => {
    it('returns unauthenticated when no token exists', async () => {
      const response = await sendMessageToBackground({ type: 'getAuthState' });
      expect(response).toEqual({
        authenticated: false,
        user: null,
      });
    });

    it('returns authenticated with user when token exists', async () => {
      setStorageData({
        github_token: 'gho_valid',
        github_user: { login: 'octocat', avatar_url: 'https://github.com/octocat.png' },
      });

      const response = await sendMessageToBackground({ type: 'getAuthState' });
      expect(response).toEqual({
        authenticated: true,
        user: { login: 'octocat', avatar_url: 'https://github.com/octocat.png' },
      });
    });
  });

  describe('startAuth', () => {
    it('completes the OAuth flow successfully', async () => {
      // Mock the identity flow to return a URL with a code
      chrome.identity.launchWebAuthFlow = vi.fn(async () =>
        'https://test-extension-id.chromiumapp.org/callback?code=auth_code_123'
      );

      // Mock the token exchange
      const mockTokenResponse = {
        ok: true,
        json: async () => ({ access_token: 'gho_new_token' }),
      };
      // Mock the user info fetch
      const mockUserResponse = {
        ok: true,
        json: async () => ({
          login: 'newuser',
          avatar_url: 'https://github.com/newuser.png',
        }),
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = url.toString();
        if (urlStr.includes('login/oauth/access_token')) {
          return mockTokenResponse as Response;
        }
        if (urlStr.includes('api.github.com/user')) {
          return mockUserResponse as Response;
        }
        return originalFetch(url);
      });

      const response = (await sendMessageToBackground({
        type: 'startAuth',
      })) as { authenticated: boolean; user: { login: string } };

      expect(response.authenticated).toBe(true);
      expect(response.user?.login).toBe('newuser');

      // Verify token was stored
      const data = getStorageData();
      expect(data.github_token).toBe('gho_new_token');
      expect(data.github_user).toEqual({
        login: 'newuser',
        avatar_url: 'https://github.com/newuser.png',
      });

      // Verify the auth URL was correct
      expect(chrome.identity.launchWebAuthFlow).toHaveBeenCalledWith({
        url: expect.stringContaining('github.com/login/oauth/authorize'),
        interactive: true,
      });

      globalThis.fetch = originalFetch;
    });

    it('returns error when auth flow is cancelled', async () => {
      chrome.identity.launchWebAuthFlow = vi.fn(async () => undefined);

      const response = (await sendMessageToBackground({
        type: 'startAuth',
      })) as { authenticated: boolean; error: string };

      expect(response.authenticated).toBe(false);
      expect(response.error).toContain('cancelled');
    });

    it('returns error when no code is in the response URL', async () => {
      chrome.identity.launchWebAuthFlow = vi.fn(async () =>
        'https://test-extension-id.chromiumapp.org/callback?error=access_denied'
      );

      const response = (await sendMessageToBackground({
        type: 'startAuth',
      })) as { authenticated: boolean; error: string };

      expect(response.authenticated).toBe(false);
      expect(response.error).toContain('No authorization code');
    });

    it('returns error when token exchange fails', async () => {
      chrome.identity.launchWebAuthFlow = vi.fn(async () =>
        'https://test-extension-id.chromiumapp.org/callback?code=bad_code'
      );

      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({
          error: 'bad_verification_code',
          error_description: 'The code passed is incorrect or expired.',
        }),
      })) as unknown as typeof fetch;

      const response = (await sendMessageToBackground({
        type: 'startAuth',
      })) as { authenticated: boolean; error: string };

      expect(response.authenticated).toBe(false);
      expect(response.error).toContain('incorrect or expired');
    });

    it('returns error when token exchange HTTP request fails', async () => {
      chrome.identity.launchWebAuthFlow = vi.fn(async () =>
        'https://test-extension-id.chromiumapp.org/callback?code=some_code'
      );

      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 500,
      })) as unknown as typeof fetch;

      const response = (await sendMessageToBackground({
        type: 'startAuth',
      })) as { authenticated: boolean; error: string };

      expect(response.authenticated).toBe(false);
      expect(response.error).toContain('500');
    });

    it('returns error when user info fetch fails', async () => {
      chrome.identity.launchWebAuthFlow = vi.fn(async () =>
        'https://test-extension-id.chromiumapp.org/callback?code=good_code'
      );

      globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = url.toString();
        if (urlStr.includes('login/oauth/access_token')) {
          return {
            ok: true,
            json: async () => ({ access_token: 'gho_token' }),
          } as Response;
        }
        return { ok: false, status: 401 } as Response;
      });

      const response = (await sendMessageToBackground({
        type: 'startAuth',
      })) as { authenticated: boolean; error: string };

      expect(response.authenticated).toBe(false);
      expect(response.error).toContain('401');
    });
  });

  describe('logout', () => {
    it('clears token and user from storage', async () => {
      setStorageData({
        github_token: 'gho_old',
        github_user: { login: 'olduser', avatar_url: 'https://example.com' },
      });

      const response = (await sendMessageToBackground({
        type: 'logout',
      })) as { authenticated: boolean };

      expect(response.authenticated).toBe(false);

      const data = getStorageData();
      expect(data.github_token).toBeUndefined();
      expect(data.github_user).toBeUndefined();
    });
  });

  describe('unknown message type', () => {
    it('returns error for unknown message type', async () => {
      const response = (await sendMessageToBackground({
        type: 'unknownAction',
      })) as { error: string };

      expect(response.error).toContain('Unknown message type');
    });
  });
});
