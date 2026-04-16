# Margin Call — Chrome Extension for GitHub PR Markdown Comments

Margin Call is a Chrome Extension (Manifest V3) that solves a fundamental GitHub limitation: you cannot write inline comments on rendered markdown previews in pull request "Files changed" pages. This extension adds that capability.

## The Problem

When reviewing a PR on GitHub, you can:
- Comment on code diffs with line-by-line precision
- View rendered markdown previews of `.md`, `.mdx`, and `.markdown` files

But you cannot do both simultaneously. If you want to comment on the rendered output of a markdown file, you have to either:
1. Leave the PR page and edit the markdown file locally
2. Write vague comments on the wrong file or the PR description
3. Use imprecise comment coordinates that don't align with the rendered text

Margin Call closes this gap.

## The Solution

The extension injects a "Review Preview" button next to each markdown file in the "Files changed" page. Clicking the button opens a side panel that displays the rendered markdown with full inline commenting capability. Comments are posted directly to GitHub via the PR Review Comments API, appearing alongside code review comments.

## Quick Start

Prerequisites: Docker, Make, Chrome (manual testing)

```bash
# Build the Docker container and compile the extension
make docker-build && make build

# Run all tests
make test

# Load the extension in Chrome
# 1. Open chrome://extensions
# 2. Enable "Developer mode" (toggle in top-right)
# 3. Click "Load unpacked"
# 4. Select the dist/ directory in this project
# 5. See your extension appear with ID (you'll need this for OAuth setup)
```

## How It Works

Margin Call has three core components running in your browser:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Background Service Worker (OAuth Manager)                  │
│  └─ Handles GitHub OAuth 2.0 authentication                 │
│  └─ Stores access token securely                            │
│  └─ Manages session state                                   │
│                                                             │
└────────┬────────────────────────────────────────────────────┘
         │
         │ Chrome Message Passing
         │
    ┌────┴──────┬──────────────────────────────────────────┐
    │            │                                          │
┌───▼────────┐  │  ┌──────────────────────────────────────┐│
│ Popup      │  │  │ Content Script (GitHub PR Page)       ││
│ (Auth UI)  │  │  │ └─ Detects markdown files             ││
└───────────┘  │  │ └─ Injects "Review Preview" buttons   ││
               │  │ └─ Launches panel for each file        ││
               │  └──────────────────────────────────────────┘
               │
         ┌─────▼──────────────────────────────────────────────┐
         │                                                     │
         │  Panel Page (Markdown Renderer + Comments UI)      │
         │  └─ Fetches PR file diff from GitHub API           │
         │  └─ Renders markdown with source line mapping      │
         │  └─ Maps user text selection to line ranges        │
         │  └─ Validates selection against diff               │
         │  └─ Posts comments via GitHub PR Review API        │
         │                                                     │
         └─────────────────────────────────────────────────────┘
```

No server infrastructure. No external API calls. Everything runs in your browser, authenticated via your own GitHub OAuth token.

## Documentation

- [DEVELOPMENT.md](./DEVELOPMENT.md) — Setup, build, and development workflow
- [ARCHITECTURE.md](./ARCHITECTURE.md) — Technical deep-dive on components, data flow, and design decisions
- [TESTING.md](./TESTING.md) — Test strategy, running tests, and writing new tests
- [PUBLISHING.md](./PUBLISHING.md) — Chrome Web Store submission and update workflow

## Key Features

- **Zero server overhead** — Everything runs in your browser using your OAuth token
- **Line-accurate comments** — Maps rendered text selection back to source markdown lines
- **Diff-aware** — Only allows comments on lines that appear in the PR diff
- **GitHub API integration** — Posts comments as PR review comments, not general comments
- **Docker-based development** — No local Node.js required, consistent environment for all developers

## Version

0.1.0 (Pre-release)

## License

See LICENSE file in repository root.
