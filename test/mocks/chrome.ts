/**
 * Mock Chrome Extension APIs for testing.
 *
 * Sets up a global `chrome` object that mimics chrome.storage.local,
 * chrome.identity, and chrome.runtime for use in vitest tests.
 */
import { vi } from 'vitest';

interface StorageData {
  [key: string]: unknown;
}

let storageData: StorageData = {};
const messageListeners: Array<
  (
    message: unknown,
    sender: { tab?: { id?: number }; id?: string },
    sendResponse: (response?: unknown) => void
  ) => boolean | void
> = [];

export function resetChromeStorage() {
  storageData = {};
}

export function resetChromeListeners() {
  messageListeners.length = 0;
}

export function getStorageData(): StorageData {
  return { ...storageData };
}

export function setStorageData(data: StorageData) {
  storageData = { ...data };
}

export function getMessageListeners() {
  return messageListeners;
}

const chromeMock = {
  storage: {
    local: {
      get: vi.fn(async (keys: string | string[] | null) => {
        if (keys === null) return { ...storageData };
        const keyList = typeof keys === 'string' ? [keys] : keys;
        const result: StorageData = {};
        for (const key of keyList) {
          if (key in storageData) {
            result[key] = storageData[key];
          }
        }
        return result;
      }),
      set: vi.fn(async (items: StorageData) => {
        Object.assign(storageData, items);
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const keyList = typeof keys === 'string' ? [keys] : keys;
        for (const key of keyList) {
          delete storageData[key];
        }
      }),
    },
  },
  identity: {
    getRedirectURL: vi.fn(
      (path?: string) =>
        `https://test-extension-id.chromiumapp.org/${path ?? ''}`
    ),
    launchWebAuthFlow: vi.fn(),
  },
  runtime: {
    id: 'test-extension-id',
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn((callback: (typeof messageListeners)[0]) => {
        messageListeners.push(callback);
      }),
      removeListener: vi.fn((callback: (typeof messageListeners)[0]) => {
        const index = messageListeners.indexOf(callback);
        if (index >= 0) messageListeners.splice(index, 1);
      }),
    },
    getURL: vi.fn((path: string) => `chrome-extension://test-extension-id/${path}`),
  },
  tabs: {
    create: vi.fn(async () => ({ id: 1 })),
  },
};

// Install globally
Object.defineProperty(globalThis, 'chrome', {
  value: chromeMock,
  writable: true,
  configurable: true,
});

// Reset storage before each test.
// NOTE: Listeners are NOT reset here — modules that register listeners at
// import time (e.g., background/index.ts) only run once (module cache).
// Clearing listeners would break integration tests that rely on them.
// Tests that need a clean listener state should call resetChromeListeners() explicitly.
beforeEach(() => {
  resetChromeStorage();
});
