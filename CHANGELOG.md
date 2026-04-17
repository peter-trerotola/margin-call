# Changelog

## 1.0.0 (2026-04-16)

### Added

- Inline commenting on rendered markdown previews in GitHub PRs
- "Review Preview" button injected on the PR "Files changed" tab for each markdown file
- Device Flow OAuth authentication (no client_secret required)
- DOMPurify sanitization of all rendered PR markdown content
- Mermaid diagram rendering from fenced code blocks
- Dark and light mode support based on system preference
- Diff highlighting of changed sections in the rendered preview
- Existing PR review comments displayed inline next to the prose they reference
- File-level comment fallback when line-level commenting is not possible
- GitHub Actions CI/CD pipeline for build, test, and packaging
