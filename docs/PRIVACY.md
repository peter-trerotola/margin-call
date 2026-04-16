# Margin Call — Privacy Policy

**Last updated:** April 16, 2026

Margin Call is a Chrome Extension that lets you comment on rendered markdown previews in GitHub pull requests. This document explains what data the extension handles, where it goes, and what control you have over it.

## TL;DR

- Margin Call stores **one** GitHub OAuth token in your browser's local storage. Nothing else is stored anywhere.
- The token never leaves your machine except in calls **your browser makes directly to api.github.com** as you.
- There is no Margin Call server. There are no analytics. There are no third-party services.
- You can revoke the token at any time, which deletes Margin Call's access to your GitHub account.

## What data is stored

The extension stores the following in `chrome.storage.local`, which is local to your browser profile and is not synced to any server:

| Key | Value | When written | When deleted |
|-----|-------|--------------|--------------|
| `github_token` | Your GitHub OAuth access token (string) | After you complete the GitHub Device Flow sign-in | When you click "Sign out" in the popup, or when you uninstall the extension |
| `github_user` | Your GitHub `login` and `avatar_url` | After successful sign-in | Same as above |
| `pending_auth` | A short-lived device-flow handshake (device code, user code, expiry) | While a sign-in is in progress | When sign-in completes, expires, or you click "Cancel" |

That is the entire list. No URLs you visit, no pull requests you read, no comments you write, and no other GitHub data is persisted by the extension.

## Where data goes

The extension communicates with two GitHub endpoints, both directly from your browser. Margin Call has no servers of its own.

| Endpoint | Why | When |
|----------|-----|------|
| `github.com/login/device/code` | Begin the OAuth Device Flow handshake (no secret required) | When you click "Sign in with GitHub" |
| `github.com/login/oauth/access_token` | Poll for the access token after you authorize on github.com | While sign-in is pending |
| `api.github.com/user` | Fetch your GitHub username + avatar to display in the popup | Immediately after sign-in |
| `api.github.com/repos/{owner}/{repo}/pulls/{pr}` | Get PR metadata to render | When you open the Review Preview |
| `api.github.com/repos/{owner}/{repo}/pulls/{pr}/files` | Get the diff so the extension can identify commentable lines | When you open the Review Preview |
| `api.github.com/repos/{owner}/{repo}/contents/{path}` | Fetch the markdown file content at the PR's head commit | When you open the Review Preview |
| `api.github.com/repos/{owner}/{repo}/pulls/{pr}/comments` | Read existing review comments + post new ones | While you're reviewing the file |

All requests are authenticated with your token and are made by your browser as you. The author of Margin Call has no visibility into them.

## What permissions the extension requests, and why

The Chrome extension manifest declares the following permissions. Each one exists for a specific reason:

- `identity` — required to use `chrome.identity` for the GitHub Device Flow sign-in. The token never leaves your browser.
- `storage` — used to store the OAuth token + cached username locally (see the table above).
- `activeTab` — used so that clicking the extension toolbar icon can interact with the current tab.
- `host_permissions` for `https://api.github.com/*` and `https://github.com/login/oauth/*` — required to make the GitHub API calls listed above.

The extension does not request access to any other websites and cannot read or modify pages outside of GitHub PR file pages.

## Third parties

There are none. No analytics. No error reporting. No CDNs. No remote code is loaded at runtime — every dependency (markdown-it, DOMPurify, Mermaid, the GitHub Markdown CSS) is bundled into the extension.

## Your data, your control

- **Sign out:** Click the extension icon → Sign out. This deletes the token and cached user info from `chrome.storage.local`. The extension can no longer make GitHub API calls on your behalf.
- **Revoke at GitHub:** Go to <https://github.com/settings/applications>, find "Margin Call" in your authorized OAuth Apps list, and click Revoke. This invalidates the token server-side at GitHub. Even if a copy of the token exists somewhere, it stops working immediately.
- **Uninstall:** Removing the extension from `chrome://extensions` deletes all `chrome.storage.local` data the extension owned.

## Children

The extension is not directed at children under 13 and does not knowingly collect data about anyone.

## Changes

If this policy ever changes in a way that affects what data is collected or shared, the change will be noted at the top of this file with a new "Last updated" date and the relevant version of the extension.

## Contact

Questions or concerns? Open an issue at <https://github.com/peter-trerotola/margin-call/issues>.
