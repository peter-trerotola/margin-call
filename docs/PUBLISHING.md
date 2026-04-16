# Margin Call Publishing Guide

How to submit Margin Call to the Chrome Web Store and manage updates.

## Prerequisites

- Chrome Web Store developer account ($5 one-time fee)
- Access to the GitHub OAuth App credentials
- Extension built and tested locally

## Pre-Publication Checklist

Before submitting to the Chrome Web Store:

- [ ] All tests pass: `make test`
- [ ] No TypeScript errors: `make lint`
- [ ] Extension loads without errors in Chrome
- [ ] OAuth flow works with real GitHub
- [ ] Comments post successfully to a real PR
- [ ] Icons are in `icons/` directory (16x16, 48x48, 128x128 PNG)
- [ ] Privacy policy is prepared
- [ ] Description and store listing assets are ready

## Creating the Distribution Package

Build the extension and create a signed ZIP:

```bash
make package
```

This:
1. Runs `make build` to compile and bundle
2. Creates `margin-call.zip` containing the contents of `dist/`

The ZIP file is ready for upload to Chrome Web Store.

```bash
ls -lh margin-call.zip
# margin-call.zip (size will vary, typically 50-200 KB)
```

## Chrome Web Store Submission

### 1. Create a Developer Account

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Log in with your Google account (or create one)
3. Accept the terms of service
4. Pay the $5 registration fee (one-time)

### 2. Create a New Item

1. In the Developer Dashboard, click **New item**
2. Select **Upload** and choose `margin-call.zip`
3. Click **Upload**

Chrome Web Store will analyze the extension for:
- Manifest validity
- Content security policy
- Permissions scope
- Unsafe code patterns

### 3. Fill Out Store Listing

#### Primary Information

**Name:** Margin Call

**Summary:** Comment on rendered markdown previews in GitHub PRs. Because GitHub won't let you write in the margins.

**Full description:**

```
Margin Call allows you to review and comment on rendered markdown 
in GitHub pull requests just like you would code.

FEATURES
- Comment on any line of rendered markdown in a PR
- Line-accurate comments that map back to source
- Comments appear as PR review comments (not general comments)
- No server required — all processing happens in your browser
- Secure OAuth authentication with your GitHub account

HOW TO USE
1. Navigate to a GitHub PR's "Files changed" page
2. Look for the "Review Preview" button next to markdown files
3. Click to open the rendered markdown in a panel
4. Select text and post comments with line precision

PERMISSIONS
- identity: Required for GitHub OAuth authentication
- storage: Required to store your GitHub access token
- activeTab: Required to detect when you're on a GitHub PR page

PRIVACY
This extension does not collect any data. It uses your GitHub 
authentication token (obtained via OAuth) to post comments on 
your behalf. The token is stored locally in your browser and 
never sent anywhere except to api.github.com.
```

#### Language

**Primary language:** English

#### Category

**Category:** Productivity

#### Detailed information

| Field | Value |
|-------|-------|
| **User support email** | Your email address |
| **Privacy policy** | See below |
| **Hosting permissions** | None (extension is self-contained) |

### 4. Privacy Policy

Create a privacy policy document. Here's a template:

```
PRIVACY POLICY FOR MARGIN CALL

Last updated: [DATE]

OVERVIEW
Margin Call is a Chrome Extension that enables inline commenting 
on rendered markdown previews in GitHub pull requests. This privacy 
policy describes how the extension handles your data.

DATA COLLECTION
Margin Call does not collect, transmit, or store any personal data 
on remote servers. All processing occurs locally in your browser.

AUTHENTICATION TOKEN
The extension uses GitHub OAuth 2.0 to obtain an access token that 
grants permission to post comments on your behalf. This token is:

- Stored locally in your browser's extension storage
- Only transmitted to api.github.com for API calls you initiate
- Never transmitted to any other service
- Only accessible to this extension (Chrome enforces isolation)
- Revocable at any time via https://github.com/settings/tokens

PERMISSIONS EXPLAINED

identity: Required to initiate GitHub OAuth authentication
- Used only when you explicitly click "Sign in with GitHub"
- Redirects to GitHub for authorization
- Extension receives authorization code, exchanges for token

storage: Required to store your GitHub access token locally
- Token stored in chrome.storage.local (not synced, extension-local)
- Allows you to stay logged in between browser sessions

activeTab: Required to detect when you're viewing GitHub PR pages
- Enables injection of "Review Preview" buttons on GitHub
- No data is extracted from the page

EXTERNAL API CALLS
The extension makes HTTPS requests only to api.github.com:
- Fetching PR metadata (owner, repo, files)
- Fetching file diffs
- Posting PR review comments
- Fetching existing comments

These requests use your GitHub access token as authorization.

USER RIGHTS
- You can revoke the extension's access at github.com/settings/tokens
- You can uninstall the extension at any time
- You can request removal of any comments you posted via GitHub

CONTACT
For questions about this privacy policy, please open an issue on 
[Your GitHub Repository].
```

Save this as a public web page (e.g., host on GitHub Pages or your personal site) and provide the URL during submission.

### 5. Add Screenshots

Chrome Web Store requires at least one screenshot. Create 1280x800 PNG images showing:

1. **Screenshot 1: Button Injection**
   - GitHub PR "Files changed" page
   - Margin Call "Review Preview" button visible next to markdown file
   - Show the button in context with GitHub's file header

2. **Screenshot 2: Panel and Comments**
   - Margin Call panel open with rendered markdown
   - Text selection highlighted
   - Comment button visible
   - (Optional) Example comment posted

Tools:
- macOS: Screenshot (Cmd+Shift+4)
- Chrome DevTools: DevTools → three dots → Capture screenshot
- Any image editor to crop and optimize

### 6. Add Icons

Place extension icons in the submission form:

| Size | Path | Format |
|------|------|--------|
| 128x128 | `icons/icon128.png` | PNG |
| 48x48 | `icons/icon48.png` | PNG |
| 16x16 | `icons/icon16.png` | PNG |

The 128x128 icon is the primary Chrome Web Store display icon. Make it distinctive and recognizable at small sizes.

### 7. Review and Submit

Before submission:

1. **Verify all fields are filled:**
   - Name, summary, description
   - Privacy policy URL
   - Support email
   - All required screenshots and icons

2. **Check manifest.json is valid:**
   - Version number (e.g., "0.1.0")
   - Description matches summary
   - Permissions are minimal and justified

3. **Verify manifest.json has an empty "key" field:**
   ```json
   "key": ""
   ```
   Chrome Web Store will generate the key when you publish.

4. **Click "Submit for review"**

Chrome will:
- Perform automated security scanning
- Check for policy violations
- Schedule manual review by a human reviewer
- Review typically takes 24-72 hours

You'll receive email updates as the review progresses.

## Post-Review: Publishing

Once your extension is approved:

1. **In Developer Dashboard**, go to your extension
2. Click **Publish** to make it live
3. It appears in Chrome Web Store within minutes
4. Users can install it directly from the store page

## Publishing an Update

When you have bug fixes or new features to release:

### 1. Update Version Number

Edit `manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Margin Call",
  "version": "0.2.0",  // Increment this
  ...
}
```

Version format: `MAJOR.MINOR.PATCH`

### 2. Build and Package

```bash
make clean
make package
```

### 3. Submit Update

1. **In Developer Dashboard**, click your extension
2. Click **Upload new package**
3. Choose `margin-call.zip`
4. Update the **What's new** section:

```
Version 0.2.0

IMPROVEMENTS
- Fixed: Comments not posting on large files
- Added: Support for .markdown file extension
- Improved: UI responsiveness on slow networks

BUGFIXES
- Fixed issue where selection mapping failed on nested code blocks
```

5. Click **Submit for review**

The review process repeats. Updated versions typically take 24-48 hours.

### 4. Users Receive Update

Once approved, existing users:
- Receive update automatically (Chrome handles distribution)
- Are notified in the Extensions menu
- Can review "What's new" in the Chrome Web Store

## Monitoring

### View Statistics

In the Developer Dashboard:

- **Active users** — How many people use your extension
- **Uninstall rate** — Are people removing it? (benchmark: <5% per month is good)
- **Crash reports** — Any reported crashes or errors
- **Reviews** — User ratings and feedback

### Respond to Reviews

Users can leave ratings and comments on your store page. Respond to:
- Bug reports with fix versions
- Feature requests with explanations
- Negative reviews with troubleshooting

## Policies

### Chrome Web Store Policies

Your extension must comply with:

1. **Permissions policy** — Only request necessary permissions
   - Margin Call: identity, storage, activeTab, host_permissions on github.com/api.github.com
   - Justified: authentication, token storage, PR page detection

2. **Security policy** — No malware, exploits, or deceptive practices
   - Margin Call: pure comment UI, no tracking, no ads

3. **User data policy** — Transparency about data collection
   - Margin Call: no data collection, see Privacy Policy

4. **Deceptive conduct policy** — Be honest about features
   - Margin Call: description accurately represents what it does

5. **Spam policy** — No spam, scams, or abuse
   - Margin Call: users explicitly authorize each comment

## Distribution Alternatives

### Direct Distribution (Skip Web Store)

You can also distribute the extension directly without Chrome Web Store:

1. Host `margin-call.zip` on your website
2. Users download it manually
3. Users load it as unpacked extension via chrome://extensions

**Pros:** No review delay, full control
**Cons:** Users must enable Developer Mode, no auto-updates, no discovery

### GitHub Releases

Attach `margin-call.zip` to GitHub releases for easy distribution to developers.

## Versioning Strategy

Use semantic versioning:

- `0.1.0` — Initial release (pre-release, unstable API)
- `0.2.0` — New features, minor changes (pre-release)
- `1.0.0` — First stable release
- `1.1.0` — New features (stable)
- `1.1.1` — Bug fixes (patch)

## Security Considerations

### Updating OAuth Credentials

If your OAuth app credentials are compromised:

1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Delete the compromised app
3. Create a new app
4. Update `src/background/index.ts` with new credentials
5. Release a new version

Users won't be affected (their tokens are valid). You prevent new users from authenticating with the old app.

## Related Documentation

- [DEVELOPMENT.md](./DEVELOPMENT.md) — Build and testing
- [README.md](./README.md) — Project overview
