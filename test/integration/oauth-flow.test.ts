import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getMessageListeners,
  setStorageData,
  getStorageData,
  resetChromeListeners,
} from '../mocks/chrome.js';

// Load background script once — it registers the message listener at import time.
await import('../../src/background/index.js');

/**
 * Simulate sending a message to the background service worker's
 * `chrome.runtime.onMessage` listener and return the response.
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

describe('OAuth Device Flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  describe('getAuthState', () => {
    it('returns unauthenticated when no token and no pending auth', async () => {
      const response = await sendMessageToBackground({ type: 'getAuthState' });
      expect(response).toMatchObject({
        status: 'unauthenticated',
        user: null,
      });
    });

    it('returns authenticated when token + user are stored', async () => {
      setStorageData({
        github_token: 'gho_stored',
        github_user: {
          login: 'octocat',
          avatar_url: 'https://example.com/octocat.png',
        },
      });

      const response = await sendMessageToBackground({ type: 'getAuthState' });
      expect(response).toMatchObject({
        status: 'authenticated',
        user: {
          login: 'octocat',
          avatar_url: 'https://example.com/octocat.png',
        },
      });
    });

    it('returns pending when a pending auth exists and is not expired', async () => {
      setStorageData({
        pending_auth: {
          device_code: 'dc_abc',
          user_code: 'WDJB-MJHT',
          verification_uri: 'https://github.com/login/device',
          expires_at: Date.now() + 600_000,
          interval: 5,
        },
      });

      const response = (await sendMessageToBackground({
        type: 'getAuthState',
      })) as { status: string; user_code: string; verification_uri: string };
      expect(response.status).toBe('pending');
      expect(response.user_code).toBe('WDJB-MJHT');
      expect(response.verification_uri).toBe(
        'https://github.com/login/device'
      );
    });

    it('clears expired pending auth and returns unauthenticated', async () => {
      setStorageData({
        pending_auth: {
          device_code: 'dc_expired',
          user_code: 'EXPR-EXPR',
          verification_uri: 'https://github.com/login/device',
          expires_at: Date.now() - 1000,
          interval: 5,
        },
      });

      const response = await sendMessageToBackground({ type: 'getAuthState' });
      expect(response).toMatchObject({
        status: 'unauthenticated',
        user: null,
      });
      expect(getStorageData().pending_auth).toBeUndefined();
    });
  });

  describe('startAuth', () => {
    it('requests a device code, stores pending state, and opens the verify tab', async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          device_code: 'dc_new',
          user_code: 'ABCD-1234',
          verification_uri: 'https://github.com/login/device',
          verification_uri_complete:
            'https://github.com/login/device?user_code=ABCD-1234',
          expires_in: 900,
          interval: 5,
        }),
      })) as unknown as typeof fetch;

      const response = (await sendMessageToBackground({
        type: 'startAuth',
      })) as {
        status: string;
        user_code: string;
        verification_uri_complete: string;
      };

      expect(response.status).toBe('pending');
      expect(response.user_code).toBe('ABCD-1234');
      expect(response.verification_uri_complete).toContain(
        'user_code=ABCD-1234'
      );

      const stored = getStorageData().pending_auth as {
        device_code: string;
        user_code: string;
      };
      expect(stored.device_code).toBe('dc_new');
      expect(stored.user_code).toBe('ABCD-1234');

      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://github.com/login/device?user_code=ABCD-1234',
      });
    });

    it('falls back to verification_uri when complete URL is not provided', async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          device_code: 'dc_legacy',
          user_code: 'LGCY-CODE',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 5,
        }),
      })) as unknown as typeof fetch;

      await sendMessageToBackground({ type: 'startAuth' });

      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://github.com/login/device',
      });
    });

    it('returns error when the device code request fails', async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      })) as unknown as typeof fetch;

      const response = (await sendMessageToBackground({
        type: 'startAuth',
      })) as { status: string; error: string };

      expect(response.status).toBe('error');
      expect(response.error).toContain('500');
    });
  });

  describe('polling', () => {
    it('exchanges device_code for token when user authorizes', async () => {
      // Step 1: device code request
      const fetchMock = vi
        .fn()
        // device/code response
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            device_code: 'dc_poll',
            user_code: 'POLL-POLL',
            verification_uri: 'https://github.com/login/device',
            expires_in: 900,
            interval: 5,
          }),
        })
        // First poll: authorization_pending
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ error: 'authorization_pending' }),
        })
        // Second poll: success
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'gho_granted' }),
        })
        // User info fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            login: 'newuser',
            avatar_url: 'https://example.com/newuser.png',
          }),
        });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      await sendMessageToBackground({ type: 'startAuth' });
      expect(getStorageData().pending_auth).toBeDefined();

      // Fast-forward past first poll interval
      await vi.advanceTimersByTimeAsync(5_000);
      // Still pending
      expect(getStorageData().github_token).toBeUndefined();

      // Fast-forward past second poll interval
      await vi.advanceTimersByTimeAsync(5_000);
      // flush any remaining microtasks
      await vi.advanceTimersByTimeAsync(100);

      expect(getStorageData().github_token).toBe('gho_granted');
      expect(getStorageData().github_user).toEqual({
        login: 'newuser',
        avatar_url: 'https://example.com/newuser.png',
      });
      expect(getStorageData().pending_auth).toBeUndefined();
    });

    it('increases interval on slow_down response', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            device_code: 'dc_slow',
            user_code: 'SLOW-SLOW',
            verification_uri: 'https://github.com/login/device',
            expires_in: 900,
            interval: 5,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ error: 'slow_down' }),
        });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      await sendMessageToBackground({ type: 'startAuth' });
      await vi.advanceTimersByTimeAsync(5_000);
      await vi.advanceTimersByTimeAsync(100);

      const stored = getStorageData().pending_auth as { interval: number };
      expect(stored.interval).toBe(10); // 5 + 5
    });

    it('clears pending auth on expired_token', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            device_code: 'dc_exp',
            user_code: 'EXP1-EXP1',
            verification_uri: 'https://github.com/login/device',
            expires_in: 900,
            interval: 5,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ error: 'expired_token' }),
        });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      await sendMessageToBackground({ type: 'startAuth' });
      await vi.advanceTimersByTimeAsync(5_000);
      await vi.advanceTimersByTimeAsync(100);

      expect(getStorageData().pending_auth).toBeUndefined();
      expect(getStorageData().github_token).toBeUndefined();
    });

    it('clears pending auth on access_denied', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            device_code: 'dc_deny',
            user_code: 'DENY-DENY',
            verification_uri: 'https://github.com/login/device',
            expires_in: 900,
            interval: 5,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ error: 'access_denied' }),
        });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      await sendMessageToBackground({ type: 'startAuth' });
      await vi.advanceTimersByTimeAsync(5_000);
      await vi.advanceTimersByTimeAsync(100);

      expect(getStorageData().pending_auth).toBeUndefined();
    });
  });

  describe('cancelAuth', () => {
    it('clears pending auth without touching tokens', async () => {
      setStorageData({
        github_token: 'gho_existing',
        github_user: { login: 'me', avatar_url: '' },
        pending_auth: {
          device_code: 'dc_cancel',
          user_code: 'CNCL-CNCL',
          verification_uri: 'https://github.com/login/device',
          expires_at: Date.now() + 600_000,
          interval: 5,
        },
      });

      await sendMessageToBackground({ type: 'cancelAuth' });

      expect(getStorageData().pending_auth).toBeUndefined();
      expect(getStorageData().github_token).toBe('gho_existing');
    });
  });

  describe('logout', () => {
    it('clears both token and pending auth', async () => {
      setStorageData({
        github_token: 'gho_old',
        github_user: { login: 'me', avatar_url: '' },
      });

      const response = (await sendMessageToBackground({
        type: 'logout',
      })) as { status: string };

      expect(response.status).toBe('unauthenticated');
      expect(getStorageData().github_token).toBeUndefined();
      expect(getStorageData().github_user).toBeUndefined();
    });
  });

  describe('openPanel', () => {
    it('opens a new tab at the given URL', async () => {
      const url =
        'chrome-extension://abc/panel/index.html?owner=o&repo=r&pull=1&path=doc.md';
      const response = (await sendMessageToBackground({
        type: 'openPanel',
        url,
      })) as { ok: boolean };

      expect(response.ok).toBe(true);
      expect(chrome.tabs.create).toHaveBeenCalledWith({ url });
    });
  });

  describe('unknown message type', () => {
    it('returns error status for unknown message type', async () => {
      const response = (await sendMessageToBackground({
        type: 'bogus',
      })) as { status: string; error: string };
      expect(response.status).toBe('error');
      expect(response.error).toContain('Unknown message type');
    });
  });
});

// Housekeeping — tests in other files don't need stale background listeners
// lingering. But clearing them would break future tests in *this* file since
// the module is cached. Leave the cleanup to vitest's per-file isolation.
void resetChromeListeners;
