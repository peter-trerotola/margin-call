# Security Policy

## Security Model

Margin Call runs entirely in your browser. There is no Margin Call server. The extension communicates only with `api.github.com` and `github.com` using your OAuth token. No data is sent to any other endpoint.

- Tokens are stored in `chrome.storage.local`, accessible only to the extension
- No analytics, telemetry, or third-party services
- No remote code loading -- all code ships in the extension package

## Why Device Flow

Standard OAuth web flows require a `client_secret` to exchange an authorization code for an access token. Chrome extensions are distributed as publicly downloadable `.zip` files, so any bundled secret is effectively public.

Margin Call uses GitHub's Device Flow, which requires only the public `client_id`. The user authorizes directly on github.com by entering a short verification code. No secret is ever stored in or transmitted by the extension.

## Content Sanitization

All markdown content rendered from PR diffs passes through DOMPurify before insertion into the DOM. This prevents cross-site scripting (XSS) from malicious PR content.

Mermaid diagrams are rendered with `securityLevel: 'strict'`, which disables click handlers and other interactive features in rendered diagrams.

## Extension Permissions

| Permission | Reason |
|------------|--------|
| `storage` | Store OAuth token and user profile in `chrome.storage.local` |
| `activeTab` | Detect GitHub PR pages and inject the content script |
| `host_permissions` (`github.com`, `api.github.com`) | Fetch PR data and post review comments via the GitHub API |

The extension does not request `identity`, `tabs` (broad), `webRequest`, or any other permissions beyond what is listed above.

## Token Lifecycle

- Tokens are obtained via Device Flow and stored in `chrome.storage.local`
- Tokens are cleared when the user signs out via the extension popup
- Tokens are cleared when the extension is uninstalled (Chrome removes all extension storage)
- Tokens can be revoked at any time at https://github.com/settings/applications

## Reporting a Vulnerability

If you discover a security issue, please open a GitHub Issue at https://github.com/peter-trerotola/margin-call/issues with the label `security`. Include steps to reproduce and any relevant details.

For sensitive disclosures that should not be public, use GitHub's private vulnerability reporting feature on the repository's Security tab.
