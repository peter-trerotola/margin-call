# Margin Call Development Guide

## Prerequisites

- **Docker** — For consistent build and test environment
- **Make** — For task automation
- **Chrome** — For manual testing (not available in container, install locally)
- **Git** — For version control

This project uses Docker to avoid installing Node.js, TypeScript, and other tooling on your host machine.

## Getting Started

### 1. Build the Docker Container

```bash
make docker-build
```

This builds a Node 24 slim container with all dependencies pre-installed (see `Dockerfile` and `docker-compose.yml`).

### 2. Install Dependencies

```bash
make install
```

Runs `npm install` inside the container. This is optional — dependencies are already in the container image.

### 3. Build the Extension

```bash
make build
```

Compiles TypeScript files in `src/` and bundles them with esbuild into `dist/`:

- `src/background/index.ts` → `dist/background.js` (OAuth manager)
- `src/content/index.ts` → `dist/content.js` (Button injection)
- `src/panel/index.ts` → `dist/panel/panel.js` (Markdown renderer + comments)
- `src/popup/index.ts` → `dist/popup/popup.js` (Auth UI)

Plus manifests, stylesheets, icons, and GitHub markdown CSS.

## Development Workflow

### Edit, Build, Test Cycle

1. Edit source files in `src/`
2. Run `make build` to compile and bundle
3. In Chrome, go to `chrome://extensions` and click the refresh icon on Margin Call
4. Test manually in a GitHub PR page

For automated testing:

```bash
# Run all unit + integration tests
make test

# Run only unit tests
make test-unit

# Run only integration tests
make test-int

# Run E2E tests with Puppeteer
make test-e2e

# Get coverage report
make test-coverage
```

### Debugging Inside the Container

Drop into an interactive shell for debugging, installing temporary packages, or exploring the environment:

```bash
make shell
```

Then use standard Node.js commands: `npm`, `node`, `npx`, etc.

## Loading the Extension in Chrome

The extension must be loaded as an unpacked extension for local development.

### First-Time Setup

1. Build the extension:
   ```bash
   make build
   ```

2. Open Chrome and navigate to `chrome://extensions`

3. Enable **Developer mode** (toggle in top-right corner)

4. Click **Load unpacked**

5. Select the `dist/` directory from this project

6. The extension appears in your list with a unique ID (e.g., `akjcnfeihkjfkmebjhdcdkhjefkafkjh`). Copy this ID — you'll need it for OAuth setup.

### Reloading After Changes

After running `make build`:

1. Go to `chrome://extensions`
2. Click the refresh icon on the Margin Call extension
3. Go to a GitHub PR "Files changed" page
4. New buttons should appear next to markdown files

## GitHub OAuth App Setup

Margin Call uses GitHub OAuth 2.0 to obtain a user's access token. This allows the extension to post comments on their behalf without storing their password.

### 1. Create an OAuth App

1. Go to `https://github.com/settings/developers` (GitHub Settings → Developer settings → OAuth Apps)
2. Click **New OAuth App**
3. Fill out the form:
   - **Application name:** Margin Call
   - **Homepage URL:** https://github.com
   - **Authorization callback URL:** `https://<EXTENSION_ID>.chromiumapp.org/callback` (see step 5 below)

4. You'll get:
   - **Client ID** — a public identifier
   - **Client Secret** — keep this private

### 2. Find Your Extension ID

If you haven't loaded the extension yet:
1. Build: `make build`
2. Load unpacked in Chrome (see "Loading the Extension" above)
3. The extension ID appears on `chrome://extensions`

### 3. Update the OAuth App's Callback

Go back to your GitHub OAuth App settings and update the **Authorization callback URL** to:

```
https://<YOUR_EXTENSION_ID>.chromiumapp.org/callback
```

For example, if your extension ID is `akjcnfeihkjfkmebjhdcdkhjefkafkjh`, use:

```
https://akjcnfeihkjfkmebjhdcdkhjefkafkjh.chromiumapp.org/callback
```

### 4. Add Credentials to the Extension

Edit `src/background/index.ts` and replace the placeholder values:

```typescript
// TODO: Replace with your GitHub OAuth App credentials after first extension load.
const CLIENT_ID = '__GITHUB_CLIENT_ID__';
const CLIENT_SECRET = '__GITHUB_CLIENT_SECRET__';
```

With your actual values:

```typescript
const CLIENT_ID = 'Iv1.abcd1234efgh5678ijkl';
const CLIENT_SECRET = 'ghp_abcd1234efgh5678ijkl9876mnopqrstu';
```

### 5. Rebuild and Test

```bash
make build
```

Reload the extension in Chrome (`chrome://extensions` → refresh button). When you next click the Margin Call extension popup, you should be able to authenticate with GitHub.

## Makefile Targets

| Target | Description |
|--------|-------------|
| `docker-build` | Build Node 24 container with all dependencies |
| `install` | Run `npm install` inside container |
| `build` | Compile TypeScript, bundle with esbuild → `dist/` |
| `test` | Run all unit + integration tests (vitest) |
| `test-unit` | Run unit tests only |
| `test-int` | Run integration tests only |
| `test-e2e` | Run E2E tests with Puppeteer |
| `test-coverage` | Run tests with coverage report |
| `lint` | Type-check with TypeScript (no emit) |
| `package` | Build and create `margin-call.zip` for Web Store submission |
| `clean` | Remove `dist/` and `margin-call.zip` |
| `shell` | Open interactive shell inside container |

## Project Structure

```
.
├── src/
│   ├── background/
│   │   └── index.ts              # OAuth service worker
│   ├── content/
│   │   ├── index.ts              # Button injection script
│   │   └── styles.css
│   ├── panel/
│   │   ├── index.ts              # Main panel page logic
│   │   ├── index.html
│   │   ├── styles.css
│   │   ├── renderer.ts           # Markdown → HTML with source mapping
│   │   ├── selection.ts          # Text selection → line mapping
│   │   ├── diff-parser.ts        # Unified diff → commentable lines
│   │   ├── comments.ts           # Display and manage comments
│   │   └── github-api.ts         # GitHub API client
│   ├── popup/
│   │   ├── index.ts              # Auth UI logic
│   │   ├── index.html
│   │   └── styles.css
│   ├── shared/
│   │   └── storage.ts            # chrome.storage.local helpers
│   └── types/
│       └── chrome.d.ts           # Chrome API types
├── test/
│   ├── unit/                     # Unit tests (vitest + jsdom)
│   ├── integration/              # Integration tests (vitest + jsdom)
│   ├── e2e/                      # E2E tests (Puppeteer)
│   ├── fixtures/                 # Test data (diffs, markdown, API responses)
│   └── mocks/                    # Chrome API mocks
├── dist/                         # Build output (generated)
├── icons/                        # Extension icons (16x16, 48x48, 128x128)
├── manifest.json                 # Chrome extension manifest
├── package.json
├── Makefile
├── Dockerfile
├── docker-compose.yml
└── docs/                         # Documentation
```

## Common Tasks

### Running Tests in Watch Mode

```bash
docker compose run --rm dev npm run test:watch
```

### Type Checking

```bash
make lint
```

Or inside the container:

```bash
make shell
npm run typecheck
```

### Adding a New Dependency

1. Edit `package.json` or run:
   ```bash
   docker compose run --rm dev npm install <package-name>
   ```

2. Rebuild the container:
   ```bash
   make docker-build
   ```

3. Rebuild the extension:
   ```bash
   make build
   ```

### Debugging Chrome API Calls

The extension uses:
- `chrome.identity.launchWebAuthFlow()` — OAuth
- `chrome.storage.local` — Token storage
- `chrome.runtime.onMessage` — Inter-script messaging
- `chrome.tabs.create()` — Opening the panel
- `chrome.runtime.getURL()` — Asset paths

To mock Chrome APIs in tests, see `test/mocks/chrome.ts`.

## Development Philosophies

- **Docker-first** — No JS/TS tools on host, consistent environment
- **Minimal dependencies** — Only `markdown-it` for rendering, `github-markdown-css` for styling
- **Source mapping** — Custom markdown-it plugin adds `data-source-line` attributes for line tracking
- **API-first comments** — Posts as PR review comments, not general comments (more professional)

## Next Steps

- Read [ARCHITECTURE.md](./ARCHITECTURE.md) for technical deep-dive
- Read [TESTING.md](./TESTING.md) for test strategy and coverage goals
- Review test fixtures in `test/fixtures/` to understand test data formats
