# Releasing Margin Call

Releases are triggered by pushing a version tag (`v1.2.3`). GitHub Actions handles the rest: builds, packages, creates a GitHub Release with the `.zip` attached, and (optionally) auto-publishes to the Chrome Web Store.

## Cutting a release

```bash
# Bump version in manifest.json + package.json, commit, tag, push
make release VERSION=1.2.3

# Or manually:
#   1. Edit manifest.json     "version": "1.2.3"
#   2. Edit package.json      "version": "1.2.3"
#   3. git commit -am "chore: release 1.2.3"
#   4. git tag v1.2.3
#   5. git push && git push origin v1.2.3
```

The release workflow then:

1. Verifies the tag matches the version in `manifest.json` and `package.json`
2. Runs the test suite
3. Builds the extension to `dist/`
4. Packages as `margin-call-v1.2.3.zip`
5. Creates a GitHub Release with auto-generated notes (PR titles since the previous tag) and the `.zip` attached
6. **If Chrome Web Store secrets are configured**, uploads the `.zip` to your CWS listing and publishes it

Pre-release tags like `v1.2.3-rc1` are marked as pre-releases in the GitHub UI.

## Verifying

After pushing the tag, watch the [Actions tab](https://github.com/peter-trerotola/margin-call/actions). The release job should complete in ~3 minutes.

The new release shows up at <https://github.com/peter-trerotola/margin-call/releases>.

## Setting up Chrome Web Store auto-publish (optional)

Once configured, every tagged release automatically uploads + publishes the new version to your Chrome Web Store listing. The first release is still done manually because you have to fill out the listing details once.

### Prerequisites

- A Chrome Web Store developer account with at least one published extension (manual publish for the first version)
- The extension's ID (visible in the Web Store URL: `chrome.google.com/webstore/detail/.../<EXTENSION_ID>`)
- A Google Cloud project with the **Chrome Web Store API** enabled

### One-time setup

1. **Create a Google Cloud project** (if you don't have one):
   - <https://console.cloud.google.com/projectcreate>

2. **Enable the Chrome Web Store API** for the project:
   - <https://console.cloud.google.com/apis/library/chromewebstore.googleapis.com>

3. **Create OAuth 2.0 credentials** (Desktop app type):
   - <https://console.cloud.google.com/apis/credentials>
   - Application type: **Desktop app**
   - Name: `Margin Call CWS Publisher`
   - Save the **Client ID** and **Client Secret**

4. **Get a refresh token** by running this OAuth consent flow once:
   - In a browser, go to:
     ```
     https://accounts.google.com/o/oauth2/auth?
       response_type=code
       &scope=https://www.googleapis.com/auth/chromewebstore
       &access_type=offline
       &prompt=consent
       &redirect_uri=urn:ietf:wg:oauth:2.0:oob
       &client_id=YOUR_CLIENT_ID
     ```
     (Strip the newlines and substitute your client ID.)
   - Approve. You'll get a code displayed on the page.
   - Exchange the code for a refresh token:
     ```bash
     curl -X POST https://oauth2.googleapis.com/token \
       -d "client_id=YOUR_CLIENT_ID" \
       -d "client_secret=YOUR_CLIENT_SECRET" \
       -d "code=THE_CODE" \
       -d "grant_type=authorization_code" \
       -d "redirect_uri=urn:ietf:wg:oauth:2.0:oob"
     ```
   - Save the `refresh_token` from the response.

5. **Add four secrets to the GitHub repo** at <https://github.com/peter-trerotola/margin-call/settings/secrets/actions>:
   - `CWS_CLIENT_ID` — from step 3
   - `CWS_CLIENT_SECRET` — from step 3
   - `CWS_REFRESH_TOKEN` — from step 4
   - `CWS_EXTENSION_ID` — from the Web Store URL

That's it. The next tag push will auto-publish.

If any secret is missing the workflow logs `Chrome Web Store secrets not configured; skipping auto-publish.` and exits cleanly. The GitHub Release is still created with the `.zip` attached, so you can manually upload to the Web Store dashboard if you prefer.

## Hotfix flow

For an urgent fix on a published version:

```bash
git checkout -b hotfix/1.2.4 v1.2.3
# ... make the fix, commit
make release VERSION=1.2.4
# Push the branch + tag; CI runs, release publishes
git push -u origin hotfix/1.2.4
```

Then open a PR from `hotfix/1.2.4` back to `main` so the fix lands on the trunk.

## Rolling back

The Chrome Web Store does not support rolling back to a prior version directly. If a release breaks something:

1. Cut a new release with the fix (`v1.2.4`)
2. Or upload the previous `.zip` from `Releases` to the Web Store dashboard manually as a new submission

The GitHub Releases page keeps every previous `.zip` so you always have the old artifacts available.

## Branch protection

Recommended GitHub settings (Settings → Branches → Branch protection rules → main):

- Require a pull request before merging
- Require status checks to pass before merging → `Build + test` (the CI job)
- Require conversation resolution before merging
- Do not allow bypassing the above settings

This ensures every change to `main` runs through CI before it lands.
