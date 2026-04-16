# Margin Call

Chrome Extension (Manifest V3) for inline commenting on rendered markdown previews in GitHub PRs.

## Development

All tooling runs inside Docker. No Node.js/npm on the host.

```bash
make docker-build   # Build container
make build          # Compile extension → dist/
make test           # Run unit + integration tests
make test-coverage  # With coverage report
make lint           # TypeScript type-check
make shell          # Debug shell inside container
make package        # Create margin-call.zip for Chrome Web Store
```

## Architecture

- `src/background/` — Service worker: GitHub OAuth via chrome.identity
- `src/content/` — Content script: injects "Review Preview" button on GitHub PR pages
- `src/panel/` — Review panel: markdown rendering, text selection, commenting
- `src/popup/` — Extension popup: sign in/out
- `src/shared/` — Shared utilities (chrome.storage helpers)
- `test/` — vitest tests (unit, integration, e2e)

## Key Technical Details

- Custom markdown-it source-map plugin (not the abandoned npm package)
- Source line mapping: `data-source-line` / `data-source-line-end` attributes on block elements
- Diff parser extracts commentable lines from unified diff patches
- Selection API maps text selections to source lines for GitHub PR review comments
- GitHub API: `line` + `side: "RIGHT"` (not deprecated `position` param)
