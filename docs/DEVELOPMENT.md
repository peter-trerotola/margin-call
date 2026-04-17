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

Margin Call uses GitHub's **OAuth Device Flow** to obtain a user's access token. The device flow requires only the public `client_id` — no `client_secret` is bundled into the extension. This is important because Chrome extensions are distributed as publicly downloadable `.zip` files; any bundled secret would leak to anyone who unpacks the extension.

### 1. Create an OAuth App

1. Go to `https://github.com/settings/developers` (GitHub Settings → Developer settings → OAuth Apps)
2. Click **New OAuth App**
3. Fill out the form:
   - **Application name:** Margin Call
   - **Homepage URL:** https://github.com/peter-trerotola/margin-call
   - **Authorization callback URL:** https://github.com (any valid URL — device flow does not use this, but GitHub requires a value)
4. Enable **Device Flow** under the OAuth App settings
5. You'll get a **Client ID** — copy it

You do not need the Client Secret. Leave it blank or ignore it.

### 2. Add the Client ID to the Extension

Edit `src/background/index.ts` and replace the placeholder value:

```typescript
// Replace with your GitHub OAuth App's client_id. No secret needed for
// device flow — client_id is public and safe to commit.
const CLIENT_ID = '__GITHUB_CLIENT_ID__';
```

With your actual client ID:

```typescript
const CLIENT_ID = 'Iv1.abcd1234efgh5678ijkl';
```

The client ID is public — it identifies your OAuth App but does not authenticate on its behalf. It is safe to commit to source control.

### 3. Rebuild and Test

```bash
make build
```

Reload the extension in Chrome (`chrome://extensions` → refresh button). Click the Margin Call extension icon:

1. Click **Sign in with GitHub**
2. A new tab opens on `https://github.com/login/device` with the verification code pre-filled
3. Authorize the app
4. Return to the popup — it will show your authenticated GitHub account

### Why Device Flow?

GitHub's standard web OAuth flow requires a `client_secret` to exchange the authorization code for an access token. In a Chrome extension, this secret would be bundled into the published `.zip` file and leak to anyone who inspects it. GitHub's `redirect_uri` validation limits the damage, but the secret is still publicly exposed.

Device Flow sidesteps this entirely: the user enters a short code on github.com, GitHub completes the authorization without any secret exchange, and the extension just needs to poll for the resulting token. The extra user step is a small price for not leaking credentials.

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
- `fetch()` to `https://github.com/login/device/code` and `https://github.com/login/oauth/access_token` — Device Flow OAuth (no `chrome.identity` needed)
- `chrome.storage.local` — token and user profile storage
- `chrome.runtime.sendMessage()` / `chrome.runtime.onMessage` — inter-script messaging (content script to background, popup to background)
- `chrome.tabs.create()` — open panel tabs and Device Flow verification pages
- `chrome.runtime.getURL()` — construct extension-internal URLs for panel HTML and assets

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
