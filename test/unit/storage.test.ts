import { describe, it, expect } from 'vitest';
import {
  getToken,
  setToken,
  clearToken,
  getUser,
  setUser,
  type GitHubUser,
} from '../../src/shared/storage.js';
import { getStorageData, setStorageData } from '../mocks/chrome.js';

describe('storage', () => {
  describe('getToken', () => {
    it('returns null when no token is stored', async () => {
      const token = await getToken();
      expect(token).toBeNull();
    });

    it('returns the stored token', async () => {
      setStorageData({ github_token: 'gho_abc123' });
      const token = await getToken();
      expect(token).toBe('gho_abc123');
    });
  });

  describe('setToken', () => {
    it('stores the token in chrome.storage.local', async () => {
      await setToken('gho_xyz789');
      const data = getStorageData();
      expect(data.github_token).toBe('gho_xyz789');
    });

    it('overwrites an existing token', async () => {
      await setToken('first');
      await setToken('second');
      const data = getStorageData();
      expect(data.github_token).toBe('second');
    });
  });

  describe('clearToken', () => {
    it('removes token and user from storage', async () => {
      setStorageData({
        github_token: 'gho_abc',
        github_user: { login: 'test', avatar_url: 'https://example.com' },
      });

      await clearToken();

      const data = getStorageData();
      expect(data.github_token).toBeUndefined();
      expect(data.github_user).toBeUndefined();
    });

    it('does not throw when storage is already empty', async () => {
      await expect(clearToken()).resolves.toBeUndefined();
    });
  });

  describe('getUser', () => {
    it('returns null when no user is stored', async () => {
      const user = await getUser();
      expect(user).toBeNull();
    });

    it('returns the stored user', async () => {
      const mockUser: GitHubUser = {
        login: 'octocat',
        avatar_url: 'https://github.com/octocat.png',
      };
      setStorageData({ github_user: mockUser });

      const user = await getUser();
      expect(user).toEqual(mockUser);
    });
  });

  describe('setUser', () => {
    it('stores the user in chrome.storage.local', async () => {
      const mockUser: GitHubUser = {
        login: 'testuser',
        avatar_url: 'https://example.com/avatar.png',
      };

      await setUser(mockUser);

      const data = getStorageData();
      expect(data.github_user).toEqual(mockUser);
    });
  });
});
