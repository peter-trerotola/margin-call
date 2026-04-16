# Margin Call Architecture

This document describes the technical design of Margin Call: component interactions, data flows, and key design decisions.

## System Overview

Margin Call consists of four main components running in separate Chrome execution contexts:

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│ Background Service Worker                                    │
│ (OAuth Handler)                                              │
│                                                              │
│  startAuth()   ──┐                                           │
│  cancelAuth()   ─┤                                           │
│  logout()       ─┼─→ GitHub Device Flow                      │
│  getAuthState() ─┘   (no client_secret)                      │
│                                                              │
│ Stores: access_token, user { login, avatar_url }            │
│ Location: chrome.storage.local                              │
│                                                              │
└──────────────────┬─────────────────────────────────────────┘
                   │
                   │ chrome.runtime.onMessage
                   │ (token request/exchange)
                   │
         ┌─────────┼──────────────┬────────────────────┐
         │         │              │                    │
    ┌────▼────┐ ┌─▼──────────┐ ┌─▼────────────────┐ ┌─▼──────────────┐
    │ Popup   │ │ Content    │ │ Panel Page      │ │ Panel Page     │
    │ (Auth   │ │ Script     │ │ (Renderer)      │ │ (Comments)     │
    │  UI)    │ │ (GitHub    │ │                 │ │                │
    │         │ │  PR Page)  │ │ - markdown-it   │ │ - Selection    │
    └─────────┘ │            │ │ - source map    │ │ - Comment post │
                │ - Parse PR │ │   plugin        │ │ - GitHub API   │
                │   info     │ │ - diff parsing  │ │                │
                │ - Inject   │ │ - line mapping  │ └────────────────┘
                │   buttons  │ │                 │
                │ - Launch   │ │ - buildLine     │
                │   panel    │ │   RangeMap()    │
                └───────────┘ │                 │
                              └─────────────────┘
```

## Component Details

### 1. Background Service Worker (OAuth Manager)

**File:** `src/background/index.ts`

Handles all GitHub authentication and token management.

#### OAuth Flow (Device Flow)

Margin Call uses GitHub's Device Flow rather than the standard Web Flow. The Web Flow requires a `client_secret` to exchange an authorization code for a token — that secret would be bundled into the extension's public `.zip` and leak. Device Flow needs only the public `client_id`.

```
User clicks "Sign in with GitHub"
  ↓
POST github.com/login/device/code (client_id, scope)
  → { device_code, user_code, verification_uri, expires_in, interval }
  ↓
Background stores { device_code, user_code, expires_at, interval }
in chrome.storage.local as `pending_auth`
  ↓
Background opens verification_uri in a new tab (user_code pre-filled)
  ↓
Background polls POST github.com/login/oauth/access_token
  (client_id, device_code, grant_type) every `interval` seconds
  ↓
User authorizes on github.com
  ↓
Poll returns { access_token }
  ↓
Token stored in chrome.storage.local
  ↓
GET api.github.com/user
  ↓
User profile stored in chrome.storage.local
pending_auth cleared
```

The polling state in `chrome.storage.local` survives service-worker restarts — `getAuthState` resumes polling automatically if the worker was killed mid-auth.

#### API

The background script responds to messages:

```typescript
// Begin device flow — returns pending state with user_code to display
chrome.runtime.sendMessage({ type: 'startAuth' })
  → { status: 'pending', user_code, verification_uri, ... }

// Poll the current auth state (popup uses this while pending)
chrome.runtime.sendMessage({ type: 'getAuthState' })
  → { status: 'authenticated' | 'pending' | 'unauthenticated', ... }

// Cancel an in-flight device-flow auth
chrome.runtime.sendMessage({ type: 'cancelAuth' })
  → { status: 'unauthenticated', user: null }

// Full sign-out (also cancels pending auth)
chrome.runtime.sendMessage({ type: 'logout' })
  → { status: 'unauthenticated', user: null }
```

#### Storage

**Key:** `github_token` (raw OAuth access token)
**Key:** `github_user` (cached `{ login, avatar_url }` for the authenticated user)

Values stored in `chrome.storage.local`, accessible only to the extension. Not sent to any server beyond GitHub's API.

### 2. Content Script (Button Injection)

**File:** `src/content/index.ts`

Runs on GitHub PR "Files changed" pages (`https://github.com/*/pull/*/files`).

#### Responsibilities

1. **Parse PR URL** — Extract owner, repo, PR number from current URL
2. **Find markdown files** — Scan DOM for file headers and identify `.md`, `.mdx`, `.markdown` files
3. **Inject buttons** — Add "Review Preview" button to each markdown file header
4. **Launch panel** — Create a new tab with the panel page, passing PR and file info via URL params

#### Button Injection

```typescript
// Button created and inserted into file header
<button class="margin-call-review-btn" data-margin-call="true">
  Review Preview
</button>
```

**Click handler:**
```typescript
chrome.tabs.create({
  url: chrome.runtime.getURL(
    `panel/index.html?owner=owner&repo=repo&pull=123&path=docs%2FREADME.md`
  )
})
```

#### Dynamic Loading

GitHub lazy-loads file headers as the user scrolls. The content script uses a `MutationObserver` to watch for new file headers and inject buttons on them.

```typescript
const observer = new MutationObserver(() => {
  injectButtons();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});
```

### 3. Panel Page (Markdown Renderer)

**Files:** `src/panel/index.ts`, `src/panel/renderer.ts`, `src/panel/diff-parser.ts`, `src/panel/selection.ts`

The panel displays rendered markdown with inline commenting. It's a full HTML page (not a popup) to avoid size constraints.

#### Rendering Pipeline

```
Raw markdown file (fetched from GitHub API)
  ↓
markdown-it.render(source)
  (with custom sourceMapPlugin)
  ↓
HTML with data-source-line attributes
  ↓
buildLineRangeMap(container)
  (walks DOM, builds { element, startLine, endLine }[] map)
  ↓
User selects text in rendered HTML
  ↓
analyzeSelection(container, lineRanges, commentableLines)
  (maps selection to source line range)
```

#### Source Mapping Plugin

The custom `sourceMapPlugin` for markdown-it copies source line information from token metadata to DOM attributes:

```html
<!-- Input markdown -->
# Heading

<!-- Token has map: [0, 2] (lines 0-1 of source) -->

<!-- Output HTML -->
<h1 data-source-line="0" data-source-line-end="2">Heading</h1>
```

This enables reverse-mapping: given a selected DOM element, we can find which source lines it came from.

#### Diff Parsing

The panel fetches the PR file diff from GitHub API. The `parseDiff()` function extracts which lines are commentable:

```
@@ -10,5 +10,6 @@
 Context line (commentable)
-Deletion (not commentable on RIGHT side)
+Addition (commentable)
 Context line (commentable)
```

**Result:**
```typescript
{
  commentableLines: Set<number> {10, 11, 12, 13, 15},  // 1-indexed
  hunks: [
    { start: 10, end: 15 }  // line ranges that changed
  ]
}
```

#### Selection Mapping

When the user selects text in the rendered markdown:

```
User selects "Heading" in the rendered <h1> element
  ↓
analyzeSelection() uses Selection API: Range.intersectsNode()
  ↓
Identifies that selection is within <h1 data-source-line="0" data-source-line-end="2">
  ↓
Maps to source lines [0, 2] (0-indexed)
  ↓
Converts to 1-indexed for GitHub API: [1, 3]
  ↓
Validates against commentableLines
  ↓
Returns SelectionResult with startLine, endLine, selectedText, rect
```

**Key types:**

```typescript
interface SelectionResult {
  selectedText: string;
  startLine: number;           // 0-indexed, source
  endLine: number;             // 0-indexed, source
  allCommentable: boolean;     // Is entire range commentable?
  commentableStartLine: number | null;  // 1-indexed, for API
  commentableEndLine: number | null;    // 1-indexed, for API
  rect: DOMRect;              // For positioning UI
}
```

### 4. Panel Page (Comments UI)

**Files:** `src/panel/comments.ts`, `src/panel/github-api.ts`

Manages the comment display and posting workflow.

#### GitHub API Integration

**Posting a comment:**
```
POST /repos/{owner}/{repo}/pulls/{pull}/comments
{
  body: "The comment text",
  commit_id: "...",
  path: "docs/README.md",
  line: 5,
  side: "RIGHT"  // DIFF only comments on the right side (new version)
}
```

**Key difference:** PR Review Comments (detailed code/file feedback) vs. Issue Comments (general PR feedback). We use Review Comments because they're line-specific and professional.

**Fetching existing comments:**
```
GET /repos/{owner}/{repo}/pulls/{pull}/comments
```

#### Display

Comments are rendered below the markdown with:
- User avatar
- Author login
- Comment timestamp
- Comment body (rendered as markdown)
- Reply handling (future enhancement)

## Data Flow: Adding a Comment

Complete flow from text selection to comment posting:

```
1. User selects text in rendered markdown
   ↓
2. analyzeSelection() fires
   - Maps selection to source lines via DOM data attributes
   - Validates against diff (commentable lines only)
   - Checks if selection is partially commentable
   ↓
3. If valid, show comment UI:
   - Display textarea
   - Show "Comment on line X-Y" message
   - If partial match, show warning
   ↓
4. User types comment and clicks "Post"
   ↓
5. Validate:
   - Get access token from chrome.storage.local
   - Ensure we have PR info (owner, repo, pull, path)
   - Ensure commentable line range exists
   ↓
6. POST /repos/{owner}/{repo}/pulls/{pull}/comments
   {
     commit_id: "...",
     path: "docs/README.md",
     line: 5,           // commentableEndLine
     side: "RIGHT",
     body: "User's comment text"
   }
   ↓
7. On success:
   - Fetch updated comments list
   - Re-render comment section
   - Clear input, close UI
```

## Design Decisions

### 1. Chrome Extension vs. Web App

**Decision:** Build as Chrome Extension (Manifest V3)

**Rationale:**
- No server infrastructure required — everything runs in the browser
- Uses Chrome's `chrome.identity` for OAuth, avoiding CORS issues
- Direct access to user's active tab and page context
- Can inject UI directly into GitHub without modifying DOM visibility
- Token stored in `chrome.storage.local`, not exposed to any server

### 2. Custom Source-Map Plugin vs. NPM Package

**Decision:** Write custom `sourceMapPlugin` instead of using `markdown-it-source-map`

**Rationale:**
- `markdown-it-source-map` last updated 2017, maintained by community
- Custom plugin is 50 lines of code, easy to modify and maintain
- Plugin directly adds DOM attributes, no need for post-processing
- Can control exactly which token types get source mapping

### 3. Docker-First Development

**Decision:** All development tooling runs in Docker

**Rationale:**
- No Node.js or TypeScript required on host machine
- Consistent environment across developers and CI
- Node 24 with all dev dependencies pre-installed
- Easy to update Node version: change `Dockerfile`, rebuild
- No dependency conflicts with system packages

### 4. markdown-it vs. remark

**Decision:** Use markdown-it

**Rationale:**
- Simpler, more direct API for rendering
- Source map plugin integrates directly via token manipulation
- Smaller bundle size than remark ecosystem
- GitHub uses markdown-it (via `github-markdown-css`), familiar rendering

### 5. Line Numbering: 0-Indexed vs. 1-Indexed

**Decision:** Internal representation is 0-indexed, convert to 1-indexed for API

**Rationale:**
- markdown-it tokens use 0-indexed line numbers
- GitHub API uses 1-indexed line numbers (human-readable)
- Conversion happens at boundaries: rendering (0-indexed) ↔ API calls (1-indexed)
- Reduces off-by-one errors in internal logic

### 6. Comment Placement: RIGHT Side Only

**Decision:** All comments go on the RIGHT side (new file version)

**Rationale:**
- LEFT side (old version) is irrelevant for commenting on rendered output
- RIGHT side is the current, reviewable version
- GitHub's diff viewer shows the new version is what matters
- Simpler UI: no "left/right" toggle needed

### 7. API Comments vs. General Comments

**Decision:** Use PR Review Comments API, not Issue Comments API

**Rationale:**
- Review Comments are line-specific and tied to commits
- Issue Comments are for general PR discussion, no line association
- Review Comments appear in the "Conversation" tab as code feedback
- More professional presentation: grouped with code review feedback

## Error Handling

### Token Missing/Expired

If the user is not authenticated or their token has expired:

```
Panel page attempts API call
  ↓
401 Unauthorized response
  ↓
Show "You need to sign in with GitHub"
  ↓
Offer quick link to click the extension popup and sign in
```

### Unauthenticated Selection

If a user selects text without being signed in:

```
Selection detected
  ↓
analyzeSelection() returns valid SelectionResult
  ↓
Check for token before showing comment UI
  ↓
If missing, show "Sign in required" message
```

### Invalid Line Range

If user selects text that spans non-commentable lines:

```
analyzeSelection() determines:
  - startLine=5, endLine=7
  - commentableLines={5, 7}  (line 6 is deletion, not commentable)
  ↓
allCommentable: false
commentableStartLine: 5
commentableEndLine: 7
  ↓
UI shows warning: "This range includes non-commentable lines"
  ↓
Offer to comment only on lines 5 and 7
```

## Performance Considerations

### Lazy DOM Walking

`buildLineRangeMap()` is expensive on large documents. The panel calls it once on render, caches the result.

### Selection Analysis

`analyzeSelection()` runs on every text selection. Uses efficient Set membership checks and array sorts (ranges are small, usually <100 elements).

### Diff Parsing

`parseDiff()` runs once per panel load. For large diffs, parsing is O(n) in lines and very fast (<10ms typically).

## Security Considerations

### Token Storage

- Stored in `chrome.storage.local` (origin-restricted, can't be accessed by other extensions or websites)
- Never logged, never sent to our servers
- User can revoke at any time via GitHub Settings

### API Calls

- All calls use Bearer token over HTTPS to api.github.com
- Calls are only made with user action (button click, comment submission)
- No background polling or silent requests

### XSS Prevention

- markdown-it's default behavior is safe (escapes HTML)
- `html: true` option allows raw HTML in markdown (GitHub standard)
- Comment bodies are rendered via markdown-it (safe)

## Testing Architecture

- **Unit tests:** Test individual functions (diff parser, selection analysis, etc.) with vitest + jsdom
- **Integration tests:** Test workflows (OAuth flow, comment posting flow) with mocked GitHub API (MSW)
- **E2E tests:** Test extension loading and button injection with Puppeteer

See [TESTING.md](./TESTING.md) for details.
