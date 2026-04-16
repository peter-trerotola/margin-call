# Launch post drafts

Three variants — pick one based on where you're posting. All draft, edit before publishing.

---

## Hacker News (Show HN)

**Title:** Show HN: Margin Call – Comment on rendered markdown previews in GitHub PRs

**Body:**

```
Reviewing technical documents in GitHub PRs is broken. You can look at the rendered markdown preview (no inline commenting) or the raw markdown diff (no rendering, hard to read prose). Not both. So most teams give up and review TRDs and RFCs in Google Docs.

I built a Chrome extension that closes that gap. Click "Review Preview" on a markdown file in a PR's "Files changed" tab and you get a side panel with the rendered markdown — Mermaid diagrams, GFM, the works. Select text in a changed section, click Comment, and it lands as a real GitHub PR review comment on the correct source line. Existing comments show up inline next to the prose.

Stack notes:

- Chrome Manifest V3, ~3MB bundle (Mermaid is most of it)
- 100% in-browser. No Margin Call server. Just chrome.storage.local for the OAuth token, talking directly to api.github.com.
- Auth is GitHub's OAuth Device Flow — needs only a public client_id, no client_secret bundled in the extension. Important because Chrome extensions ship as publicly downloadable .zips and any bundled secret would leak.
- Custom markdown-it plugin maps rendered text back to source markdown line numbers via the .map property on block tokens. The selection-to-line mapping uses the Selection API + range.intersectsNode against data-source-line annotated elements. Diff lines come from parsing GitHub's unified-diff patches; the comment-button is disabled (with a clear tooltip) on lines that aren't part of the PR diff because GitHub's API rejects comments outside the diff hunks.
- DOMPurify before insertion to handle PR-author-controlled markdown (script payloads in markdown render in the chrome-extension:// origin and would otherwise have access to chrome.storage.local).

Open source (MIT), Chrome Web Store: https://chrome.google.com/webstore/detail/margin-call/[ID once published]
Repo + issues: https://github.com/peter-trerotola/margin-call

Happy to answer questions about the architecture or the markdown-source-mapping bit.
```

---

## Reddit r/programming or r/webdev

**Title:** I made a Chrome extension to comment on rendered markdown previews in GitHub PRs

**Body:**

```
GitHub has a longstanding gap: when you're reviewing a PR that adds a markdown document — a TRD, RFC, runbook, design doc — you can either look at the rendered markdown preview (no commenting) or the raw markdown diff (no rendering, hard to read prose). For document-heavy PRs, the workflow ends up being "give up on GitHub, paste the doc into Google Docs, comment there, lose the version control."

Margin Call adds inline commenting to the rendered preview. It's a Chrome extension that:

- Adds a "Review Preview" button next to markdown files on a PR's Files changed tab
- Opens the rendered version in a side panel with full Mermaid + GFM support
- Highlights the changed sections in green
- Lets you select text and post a real GitHub PR review comment on the right source line
- Shows existing review comments inline next to the prose

100% in your browser. No servers. No analytics. Source on GitHub (MIT licensed):
https://github.com/peter-trerotola/margin-call

Chrome Web Store:
https://chrome.google.com/webstore/detail/margin-call/[ID]

Built it because I was tired of the Google Docs round-trip. If your team also reviews TRDs / RFCs in PRs, hopefully this helps.

Happy to take feature requests in the issue tracker.
```

---

## Personal blog post

**Title:** Margin Call: closing GitHub's worst review gap

**Lede paragraph:**

```
GitHub is great at code review and bad at document review. The "Files changed" tab on a PR will happily render your README, your RFC, your TRD as styled prose with tables and Mermaid diagrams, but it won't let you click on the rendered text to leave a comment. To comment, you have to switch to the raw markdown diff — losing the rendering, and trying to align your feedback with line numbers in a wall of `**bold**` and `[link](url)` syntax.

The result, if you've ever tried to review a serious document in a GitHub PR, is that you give up and load the doc into Google Docs. Then you spend an hour reformatting. Then you copy comments back to the PR. Then you do it again on every revision.

I built a Chrome extension to close that gap. Margin Call adds a "Review Preview" button next to every markdown file on a PR. Click it, and you get the rendered version in a side panel with full inline commenting. Select text, click Comment, the comment lands as a real GitHub PR review comment on the correct source line.
```

**Outline for the rest:**

1. The gap (a paragraph on why GitHub's existing rich-diff doesn't support comments)
2. What Margin Call does (a screenshot or two, focus on the UX)
3. The interesting technical bits:
   - Source-line mapping in markdown-it (the .map trick)
   - Diff parsing for commentable line validation
   - Why Device Flow instead of web flow (the client_secret leak problem in published extensions)
   - DOMPurify between markdown-it and innerHTML (PR-author content is untrusted)
4. What's missing / what's next (Firefox/Edge ports, suggestion mode, cross-PR comment search)
5. Repo + Chrome Web Store links + invitation to file issues

---

## Where to post and in what order

Suggested sequence:

1. **Day 0:** Submit to Chrome Web Store (1–7 day review)
2. **Day 1–7:** While waiting, write the blog post (most polished, longest shelf life)
3. **Day approval:** Chrome Web Store goes live → publish the blog post first → wait a few hours
4. **Day approval +1:** Show HN with the Web Store link in the body. Best time: Tuesday/Wednesday, 8–11am PT.
5. **Day approval +2 to 7:** Reddit r/programming, r/webdev, r/github. Cross-posting too fast looks like spam; space them out.
6. **Always:** Pin the Chrome Web Store link to the top of the GitHub repo README and the repo's "About" sidebar.
