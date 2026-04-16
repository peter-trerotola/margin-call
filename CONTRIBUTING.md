# Contributing to Margin Call

Thanks for considering a contribution. Margin Call is a small project and contributions of all sizes are welcome — bug reports, fixes, new diagram types, browser-compat work, anything.

## Ground rules

1. **All tooling runs in Docker.** You should not need Node.js, npm, or TypeScript installed on your host. The `Makefile` is the interface.
2. **Tests must pass.** `make test` is run on every PR. Add tests for new behavior.
3. **No new dependencies without a reason.** Bundle size matters for an extension.
4. **PRs over issues.** If you can ship the fix, ship the fix. If you can't, file the issue.

## Local development

You need Docker, Make, and Chrome (for manual testing only). See [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) for the full setup.

```bash
make docker-build      # build the dev container (one-time)
make build             # compile + bundle to dist/
make test              # run all unit + integration tests
make test-coverage     # with coverage report
make lint              # tsc --noEmit
make shell             # drop into the container for debugging
```

Iterate by editing source → `make build` → click the reload button on the Margin Call card at `chrome://extensions`.

## Architecture overview

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md). The four moving parts:

- `src/background/` — service worker handling GitHub OAuth via Device Flow
- `src/content/` — script injected into GitHub PR pages, adds the Review Preview button
- `src/panel/` — the panel page that renders markdown, parses the diff, handles selection → comment
- `src/popup/` — the toolbar popup for sign in / out

Tests sit alongside in `test/unit/` and `test/integration/`. Fixtures live in `test/fixtures/`.

## Pull request checklist

Before opening a PR:

- [ ] `make test` passes
- [ ] If you touched a security-sensitive area (auth, sanitization, anything that handles tokens or HTML), call it out in the PR description
- [ ] Updated docs (`docs/`) if behavior changed
- [ ] Updated `CHANGELOG.md` if a user-visible feature or fix
- [ ] Squash unrelated commits

Open the PR against `main`. CI will run the same checks; ask for review when it's green.

## Reporting bugs

Open an issue at <https://github.com/peter-trerotola/margin-call/issues>. Include:

- Chrome version
- OS
- Console output from both the extension popup (right-click → Inspect popup) and the panel page (DevTools while the panel tab is focused)
- Screenshot if it's visual

If you can describe a minimal reproduction (a public PR with a markdown file that exhibits the bug), even better.

## Code of conduct

Be kind. Discuss the work, not the person. If a discussion stops being productive, walk away from the keyboard.
