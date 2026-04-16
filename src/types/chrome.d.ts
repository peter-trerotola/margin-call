/**
 * Chrome Extension API type declarations.
 * Only the APIs used by Margin Call are declared here.
 */

declare namespace chrome {
  namespace identity {
    function getRedirectURL(path?: string): string;
    function launchWebAuthFlow(
      details: { url: string; interactive: boolean },
      callback?: (responseUrl?: string) => void
    ): Promise<string | undefined>;
  }

  namespace storage {
    interface StorageArea {
      get(
        keys: string | string[] | null
      ): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    }
    const local: StorageArea;
  }

  namespace runtime {
    const id: string;
    function sendMessage<T = unknown>(message: unknown): Promise<T>;
    const onMessage: {
      addListener(
        callback: (
          message: unknown,
          sender: { tab?: { id?: number }; id?: string },
          sendResponse: (response?: unknown) => void
        ) => boolean | void | Promise<void>
      ): void;
      removeListener(callback: (...args: unknown[]) => void): void;
    };
    function getURL(path: string): string;
  }

  namespace tabs {
    function create(properties: { url: string; active?: boolean }): Promise<{ id?: number }>;
  }
}
