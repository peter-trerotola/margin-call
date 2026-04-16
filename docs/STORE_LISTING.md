# Chrome Web Store listing copy

Paste these into the Chrome Web Store dashboard when submitting `margin-call.zip`.

## Item details

**Name:** `Margin Call`

**Summary** (132 char max — used as the search-result snippet):
```
Comment on rendered markdown previews in GitHub PRs. The thing GitHub forgot.
```

**Category:** Developer Tools

**Language:** English

## Description

Reviewing technical documents in GitHub PRs is broken. You can either look at the rendered markdown preview (no inline commenting) or the raw markdown diff (no rendering, hard to read prose). Margin Call closes that gap.

What it does:

• Adds a "Review Preview" button next to every markdown file on a PR's "Files changed" tab
• Opens a side panel with the rendered markdown, including Mermaid diagrams and GitHub-flavored markdown extensions
• Highlights the sections that were changed in the PR with a green left border
• Lets you select any text in a changed section and post a comment that lands as a real GitHub PR review comment on the correct line
• Shows existing review comments inline next to the prose they refer to, with full reply support
• Follows your system light/dark mode preference

How it works:

• 100% in-browser. There is no Margin Call server.
• Your GitHub OAuth token is stored locally in chrome.storage.local and is sent only to api.github.com, by your browser, as you.
• No analytics, no error reporting, no third-party services. Every dependency (markdown-it, DOMPurify, Mermaid) is bundled into the extension — no remote code is loaded at runtime.
• Uses GitHub's OAuth Device Flow, which means the extension never needs a client secret. The token is yours and only yours.

Source code, docs, and issue tracker:
https://github.com/peter-trerotola/margin-call

Privacy policy:
https://github.com/peter-trerotola/margin-call/blob/main/docs/PRIVACY.md

## Single-purpose statement

Required by Chrome Web Store. The extension serves one purpose:

```
Margin Call adds inline commenting to rendered markdown previews on GitHub pull request "Files changed" pages, posting comments to the GitHub PR Review Comments API on behalf of the signed-in user.
```

## Permission justifications

Each permission must be justified in the developer dashboard. Verbatim text:

**`identity`**
```
Used to call chrome.identity.launchWebAuthFlow for the GitHub OAuth Device Flow. This is the only way to authenticate users with GitHub from a Chrome extension without bundling a client secret (which would leak in the publicly downloadable extension package).
```

**`storage`**
```
Used to store the user's GitHub OAuth access token and cached username/avatar in chrome.storage.local. Without persistent storage the user would have to re-authenticate every time they open the extension popup or panel page.
```

**`activeTab`**
```
Used so that interactions with the extension's toolbar icon work in the context of the user's currently active tab.
```

**`host_permissions: https://api.github.com/*`**
```
The extension fetches PR metadata, file contents, diff hunks, and existing review comments from the GitHub REST API, and POSTs new review comments to it. Without access to api.github.com the extension cannot function.
```

**`host_permissions: https://github.com/login/oauth/*`**
```
Required to complete the GitHub OAuth Device Flow handshake (POST to /login/device/code and POST to /login/oauth/access_token). These endpoints are not on api.github.com, so they need their own host permission entry.
```

## Privacy practices section (in the dashboard)

Tick the boxes that match the privacy policy:

- "Personally identifiable information" → **No** (we cache the user's own GitHub login name + avatar URL for display only; we do not collect or transmit it)
- "Health information" → No
- "Financial and payment information" → No
- "Authentication information" → **Yes** (the GitHub OAuth token, stored locally in chrome.storage.local, sent only to api.github.com by the user's own browser)
- "Personal communications" → No
- "Location" → No
- "Web history" → No
- "User activity" → No
- "Website content" → **Yes** (markdown content from the user's own PR files, fetched from GitHub at the user's request, never stored or sent anywhere except back to GitHub for the comment post)

Certifications:
- I do not sell or transfer user data to third parties for purposes unrelated to the item's single purpose: **Yes**
- I do not use or transfer user data for purposes unrelated to the item's single purpose: **Yes**
- I do not use or transfer user data to determine creditworthiness or for lending purposes: **Yes**

## Screenshots

Chrome Web Store requires 1280×800 or 640×400 PNG/JPG screenshots, at least 1, ideally 3–5. Suggested set:

1. **The "Review Preview" button injected on a real PR** — show the green button next to the GitHub file header on a `.md` file
2. **The rendered preview panel** — showing markdown with the green left-border diff highlighting, the +/− legend at the top
3. **Selecting text in a changed section** — with the floating "Comment" button visible
4. **The comment composer** — open form with the selected text quoted, ready to submit
5. **An inline existing-comments thread** — with a reply form expanded, showing the threading

Take these on a real PR (PR #3 or any other on the margin-call repo works). Screen-grab the relevant area, save as PNG, upload in the dashboard.

## Promotional images (optional)

- **Small tile:** 440×280 PNG. Optional but recommended for store discovery.
- **Marquee:** 1400×560 PNG. Used in featured sections, low priority for an unfeatured item.

Skip both for the initial submission; add later if traction justifies.

## Submission notes

- Set distribution to **Public**
- Visible in: search + listings
- Pricing: Free
- Allowed regions: All
- Mature content: No
- After uploading the .zip, expect 1–7 days for review
