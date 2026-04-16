# Margin Call Testing Guide

This document describes the testing strategy, how to run tests, and how to write new tests.

## Test Pyramid

```
        /\
       /  \                 E2E Tests (Puppeteer)
      /    \               Test extension loading,
     /______\              button injection, panel rendering
     
     /      \
    /        \             Integration Tests (vitest + jsdom)
   /          \            Test workflows: OAuth flow,
  /____________\           comment posting, API calls

  /            \
 /              \          Unit Tests (vitest + jsdom)
/________________\         Test individual functions:
                           diff parsing, selection mapping,
                           rendering, storage, API calls
```

## Running Tests

### All Tests

```bash
make test
```

Runs all unit, integration, and E2E tests in sequence.

### Unit Tests Only

```bash
make test-unit
```

Runs tests in `test/unit/` using vitest + jsdom.

### Integration Tests Only

```bash
make test-int
```

Runs tests in `test/integration/` using vitest + jsdom with mocked GitHub API (MSW).

### E2E Tests Only

```bash
make test-e2e
```

Runs tests in `test/e2e/` using Puppeteer to control a real Chrome instance.

### Coverage Report

```bash
make test-coverage
```

Generates a coverage report for all tests. Coverage targets:
- Core modules (diff-parser, renderer, selection): 95%+
- APIs and utilities: 90%+
- UI and integration: 80%+

### Watch Mode (Continuous)

```bash
docker compose run --rm dev npm run test:watch
```

Runs tests in watch mode. Tests re-run as you save files. Exit with `Ctrl+C`.

## Test Organization

### Unit Tests (`test/unit/`)

Test individual functions in isolation using vitest + jsdom.

| File | Tests |
|------|-------|
| `diff-parser.test.ts` | `parseDiff()`, `findNearestCommentableLine()` |
| `renderer.test.ts` | `createRenderer()`, `renderMarkdown()`, `buildLineRangeMap()`, `sourceMapPlugin` |
| `selection.test.ts` | `analyzeSelection()` for various DOM and selection scenarios |
| `github-api.test.ts` | GitHub API client methods (fetch PR, post comment, etc.) |
| `storage.test.ts` | `chrome.storage.local` helpers (setToken, getToken, setUser, getUser) |
| `content-injection.test.ts` | `parsePrUrl()`, `extractFilePath()`, `isMarkdownFile()` |

**Example:**

```typescript
import { describe, it, expect } from 'vitest';
import { parseDiff } from '../src/panel/diff-parser';

describe('diff-parser', () => {
  it('identifies commentable lines in a unified diff', () => {
    const patch = `@@ -1,3 +1,4 @@
 Context
-Deleted
+Added
 Context`;

    const result = parseDiff(patch);

    expect(result.commentableLines).toContain(1);  // First context
    expect(result.commentableLines).toContain(3);  // Added line
    expect(result.commentableLines).toContain(4);  // Last context
    expect(result.commentableLines).not.toContain(2);  // Deleted
  });
});
```

### Integration Tests (`test/integration/`)

Test workflows involving multiple components, with mocked external APIs.

| File | Tests |
|------|-------|
| `oauth-flow.test.ts` | OAuth authentication, token exchange, user storage |
| `comment-flow.test.ts` | Full workflow: selection → validation → API call → display |
| `pr-loading.test.ts` | Loading PR diff, identifying markdown files, fetching content |
| `comment-display.test.ts` | Rendering comments, handling missing fields, formatting |

Uses `msw` (Mock Service Worker) to intercept GitHub API calls.

**Example:**

```typescript
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const server = setupServer(
  http.post('https://api.github.com/login/oauth/access_token', () => {
    return HttpResponse.json({
      access_token: 'test_token_123',
      token_type: 'bearer'
    });
  })
);

describe('oauth-flow', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('exchanges authorization code for access token', async () => {
    const response = await fetch(
      'https://api.github.com/login/oauth/access_token',
      {
        method: 'POST',
        body: JSON.stringify({ code: 'test_code' })
      }
    );

    const data = await response.json();
    expect(data.access_token).toBe('test_token_123');
  });
});
```

### E2E Tests (`test/e2e/`)

Test the extension end-to-end using Puppeteer to launch a real Chrome instance.

| File | Tests |
|------|-------|
| `extension-loading.test.ts` | Load unpacked extension, verify it appears |
| `button-injection.test.ts` | Navigate to PR page, verify buttons appear on markdown files |
| `panel-rendering.test.ts` | Click button, verify panel opens and renders markdown |

**Example:**

```typescript
import { describe, it, expect } from 'vitest';
import puppeteer, { Browser, Page } from 'puppeteer';

describe('extension-loading', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    const pathToExtension = require('path').join(__dirname, '../../dist');
    browser = await puppeteer.launch({
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`
      ]
    });
    page = await browser.newPage();
  });

  it('extension loads without errors', async () => {
    await page.goto('chrome://extensions');
    const extensionName = await page.$eval(
      '[data-test-id="Margin Call"]',
      el => el.textContent
    );
    expect(extensionName).toBe('Margin Call');
  });
});
```

## Test Fixtures

Fixtures are sample data used across tests. Located in `test/fixtures/`:

### Markdown Files (`fixtures/markdown/`)

Real `.md` content for testing rendering:

- `simple.md` — Basic paragraph, heading, list
- `code-blocks.md` — Code fence with syntax highlighting
- `gfm.md` — GitHub Flavored Markdown (tables, strikethrough, etc.)
- `nested.md` — Nested lists, blockquotes, complex structure

### Diff Patches (`fixtures/diffs/`)

Unified diff patches for testing diff parsing:

```
@@ -1,3 +1,4 @@
 Line 1
-Removed
+Added
 Line 3
```

### API Responses (`fixtures/api-responses/`)

JSON files containing real GitHub API response shapes:

- `pr-info.json` — GitHub PR metadata (owner, repo, title, etc.)
- `pr-files.json` — List of files changed in PR
- `comments.json` — Existing comments on a file

## Mocks

### Chrome API Mock (`test/mocks/chrome.ts`)

Provides mock implementations of Chrome APIs for testing:

```typescript
export const mockChrome = {
  runtime: {
    getURL: (path: string) => `chrome-extension://test-id/${path}`,
    onMessage: { addListener: vi.fn() },
    sendMessage: vi.fn()
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn()
    }
  },
  identity: {
    getRedirectURL: (path: string) => `https://test-id.chromiumapp.org/${path}`,
    launchWebAuthFlow: vi.fn()
  },
  tabs: {
    create: vi.fn()
  }
};

// In test file:
beforeEach(() => {
  global.chrome = mockChrome;
});
```

## Writing New Tests

### When to Write Tests

- New feature or function
- Bug fix (add test that catches the bug, fix it, verify test passes)
- Complex logic that could regress

### Test File Naming

- Unit test: `src/feature.ts` → `test/unit/feature.test.ts`
- Integration test: `test/integration/workflow-name.test.ts`
- E2E test: `test/e2e/user-scenario.test.ts`

### Basic Structure

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('feature description', () => {
  // Setup
  beforeEach(() => {
    // Initialize test state
  });

  // Cleanup
  afterEach(() => {
    // Clean up resources
  });

  // Test case
  it('should do something specific', () => {
    // Arrange: set up test data
    const input = { ... };

    // Act: call the function
    const result = myFunction(input);

    // Assert: verify the result
    expect(result).toBe(expectedValue);
  });

  // Another test case
  it('should handle edge case', () => {
    const input = { ... };
    expect(() => myFunction(input)).toThrow();
  });
});
```

### Testing Selection Analysis

```typescript
import { analyzeSelection } from '../src/panel/selection';

it('maps text selection to source lines', () => {
  // Create a minimal DOM structure
  const container = document.createElement('div');
  container.innerHTML = `
    <p data-source-line="0" data-source-line-end="1">First paragraph</p>
    <p data-source-line="2" data-source-line-end="3">Second paragraph</p>
  `;
  document.body.appendChild(container);

  // Get line ranges
  const lineRanges = buildLineRangeMap(container);

  // Simulate user selection
  const para = container.querySelector('p:nth-child(1)');
  const range = document.createRange();
  range.selectNodeContents(para);
  
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);

  // Analyze the selection
  const commentableLines = new Set([1, 2, 3]);  // From diff parsing
  const result = analyzeSelection(container, lineRanges, commentableLines);

  expect(result?.startLine).toBe(0);
  expect(result?.endLine).toBe(1);
  expect(result?.allCommentable).toBe(true);
});
```

### Testing GitHub API Calls

```typescript
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { postComment } from '../src/panel/github-api';

const server = setupServer(
  http.post(
    'https://api.github.com/repos/:owner/:repo/pulls/:pull/comments',
    ({ params }) => {
      return HttpResponse.json({
        id: 123,
        user: { login: 'testuser' },
        body: 'Test comment',
        commit_id: 'abc123',
        path: 'docs/README.md',
        line: 5
      });
    }
  )
);

describe('github-api', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('posts a comment to a PR', async () => {
    const comment = await postComment({
      owner: 'octocat',
      repo: 'Hello-World',
      pull: 1,
      commit_id: 'abc123',
      path: 'docs/README.md',
      line: 5,
      body: 'Test comment'
    }, 'test_token');

    expect(comment.id).toBe(123);
    expect(comment.body).toBe('Test comment');
  });
});
```

### Testing Async Code

```typescript
it('handles async operations', async () => {
  const token = 'test_token';
  const result = await fetchPRInfo('octocat', 'Hello-World', 1, token);
  
  expect(result.title).toBeDefined();
  expect(result.state).toBe('open');
});
```

### Testing Error Cases

```typescript
it('throws on invalid line range', () => {
  const commentableLines = new Set([1, 3, 5]);  // Gap at line 2
  
  expect(() => {
    validateLineRange(2, 2, commentableLines);
  }).toThrow('Line 2 is not commentable');
});

it('handles API errors gracefully', async () => {
  server.use(
    http.post('https://api.github.com/repos/:owner/:repo/pulls/:pull/comments', () => {
      return HttpResponse.json(
        { message: 'Validation failed' },
        { status: 422 }
      );
    })
  );

  await expect(
    postComment({ ... }, 'invalid_token')
  ).rejects.toThrow();
});
```

## Coverage Goals

| Module | Target | Rationale |
|--------|--------|-----------|
| diff-parser.ts | 95%+ | Core logic, must be bulletproof |
| renderer.ts | 95%+ | Source mapping is critical |
| selection.ts | 95%+ | Line mapping must be accurate |
| github-api.ts | 90%+ | API integration, but framework handles HTTP |
| storage.ts | 90%+ | Simple wrapper, but important for auth |
| content/index.ts | 85%+ | UI and DOM manipulation, harder to test |
| comments.ts | 80%+ | UI rendering, tested via E2E |
| popup/index.ts | 75%+ | UI, mostly manual testing |

Run `make test-coverage` to see current coverage.

## Continuous Integration

Tests run on every commit (via pre-commit hook or CI pipeline). All tests must pass before merging to `main`.

## Debugging Tests

### Print Debug Info

```typescript
import { describe, it } from 'vitest';

it('debug test', () => {
  const value = computeValue();
  console.log('computed value:', value);
  expect(value).toBe(expectedValue);
});

// Run with debug output
docker compose run --rm dev npm test -- --reporter=verbose
```

### Run Single Test

```bash
docker compose run --rm dev npm test -- --grep "map text selection"
```

### Debug in Container

```bash
make shell
npm run test:watch
# Use Ctrl+C to stop, exit to leave container
```

### Inspect DOM in Tests

```typescript
it('builds correct line range map', () => {
  const container = document.createElement('div');
  container.innerHTML = `<p data-source-line="0">Text</p>`;
  
  console.log('Container HTML:', container.outerHTML);
  const ranges = buildLineRangeMap(container);
  console.log('Ranges:', ranges);
  
  expect(ranges.length).toBe(1);
});
```

## Common Issues

### `TypeError: window.getSelection is not a function`

jsdom doesn't fully implement Selection API. Use mocks or check for existence:

```typescript
export function analyzeSelection(...) {
  const selection = window.getSelection?.();
  if (!selection) return null;
  // ...
}
```

### `Cannot find module 'chrome'`

Mock Chrome in `beforeEach`:

```typescript
import { mockChrome } from '../mocks/chrome';

beforeEach(() => {
  global.chrome = mockChrome;
});
```

### MSW Not Intercepting Requests

Ensure server is started in `beforeAll`:

```typescript
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### Test Timeout

Tests default to 5000ms. Increase for slow operations:

```typescript
it('fetches large file', async () => {
  // ... async operation
}, 10000);  // 10 second timeout
```

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — Component details and data flows
- [DEVELOPMENT.md](./DEVELOPMENT.md) — Build and testing commands
