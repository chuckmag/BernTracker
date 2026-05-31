# apps/mobile

React Native (Expo SDK 54) member app. Day-to-day dev runs through Expo Go and the simulator; this README covers the **build & ship** workflow — turning the JS app into a signed `.ipa` / `.aab` and getting it into TestFlight / Google Play Internal Testing.

For day-to-day patterns (theming, primitives, testing), see `CLAUDE.md` in this directory.

## TL;DR

```bash
# from apps/mobile/

# Daily dev — no EAS account needed
npm run dev                      # expo start, scan QR with Expo Go

# Shipping a build to internal testers (TestFlight / Play Internal Testing)
npm run build:preview:ios        # ~25-45 min cloud build, watch at expo.dev
npm run submit:preview:ios       # uploads the latest build to TestFlight
npm run build:preview:android    # ~15-30 min cloud build
npm run submit:preview:android   # uploads the latest build to Play Internal Testing
```

The full table of scripts and what they do is in [Build & submit scripts](#build--submit-scripts) below.

## Project context — read this first

- **EAS project owner is `wodtech`** (the org), not anyone's personal account. When you `npx eas-cli@latest login`, log in as a user who's a member of `wodtech`. The project ID is `f0a6deb9-d571-4d24-9e33-d456bf16ebe3`, set via the `EAS_PROJECT_ID` env var in every build profile's `env` block in `eas.json` — `app.config.ts` reads it from `process.env` at config-eval time (see [Dynamic Expo config](#dynamic-expo-config) below).
- **Two app stores, three keys.**
  - **Apple Developer Program** ($99/yr) account → App Store Connect API key → `apps/mobile/keys/AuthKey.p8`
  - **Google Play Console** ($25 one-time) account → Google Cloud service account → `apps/mobile/keys/berntracker-d54bfe373fb7.json`
  - Both keys are **gitignored**. They live on disk per-developer; new engineers either get them from a teammate via secure channel or generate their own.
- **`eas.json` defines three profiles:**
  - `development` — dev client build for testing native modules. **iOS Simulator only** today (real-device dev-client would need a separate `development-device` profile we haven't created yet).
  - `preview` — distributes to **TestFlight** (iOS) and **Play Internal Testing** (Android). This is the "share with internal testers" profile.
  - `production` — distributes to the **App Store** (iOS) and the **Play Store production track** (Android).

## One-time setup for a new engineer

You only need this if you're going to run `eas build` or `eas submit` from your machine. Pure JS dev (Expo Go) needs none of it.

1. **Get added to the `wodtech` Expo org** ([expo.dev](https://expo.dev) → org settings → invite). Then `npx eas-cli@latest login` and pick the account that's a member.
2. **Get the iOS API key** — `apps/mobile/keys/AuthKey.p8`. Ask a teammate, or generate a new one at [App Store Connect → Users and Access → Integrations → App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api). If you generate a new one, also update `ascApiKeyId` and `ascApiKeyIssuerId` in `eas.json` — and remember Apple shows the `.p8` exactly once at download time.
3. **Get the Android service account JSON** — `apps/mobile/keys/berntracker-d54bfe373fb7.json`. Ask a teammate; this one is harder to regenerate because the Play Console binding is account-scoped.
4. **Verify locally**: `npx eas-cli@latest whoami` should print your Expo username; `ls apps/mobile/keys/` should show both files.

## Build & submit scripts

13 scripts in `package.json`, all run from `apps/mobile/`. The pattern is `<verb>:<profile>[:<platform>]`.

| Script | What it does |
|---|---|
| `npm run build:development:ios` | Build a dev-client `.app` for **iOS Simulator only** |
| `npm run build:development:android` | Build a dev-client `.apk` for Android emulator or device |
| `npm run build:development` | Both platforms in one queue |
| `npm run build:preview:ios` | Build a signed `.ipa` for TestFlight |
| `npm run build:preview:android` | Build a signed `.aab` for Play Internal Testing |
| `npm run build:preview` | Both platforms — most common "ship to testers" command |
| `npm run build:production:ios` | Build a signed `.ipa` for the App Store |
| `npm run build:production:android` | Build a signed `.aab` for the Play Store production track |
| `npm run build:production` | Both platforms |
| `npm run submit:preview:ios` | Upload the latest `preview` iOS build to TestFlight |
| `npm run submit:preview:android` | Upload the latest `preview` Android build to Play Internal Testing |
| `npm run submit:production:ios` | Upload the latest `production` iOS build to the App Store |
| `npm run submit:production:android` | Upload the latest `production` Android build to the Play Store production track |

All scripts wrap `npx eas-cli@latest`. The `cli.version: ">= 16.0.0"` floor in `eas.json` guards against running with a CLI that's too old.

### How build and submit relate

`build:*` and `submit:*` are **separate commands**. EAS builds happen in the cloud and take 15–45 minutes; you have to wait for one to finish before you can submit it.

Typical flow for shipping a preview build:

1. `npm run build:preview:ios` (or `:android`, or just `:preview` for both)
2. The command prints a build URL like `https://expo.dev/accounts/wodtech/projects/wodalytics/builds/<id>`. The terminal also tails build progress.
3. When the build completes (status `FINISHED`), run `npm run submit:preview:ios`. The `--latest` flag baked into the script automatically picks up the most recent successful build for that profile/platform.
4. Apple/Google process the upload — TestFlight is usually ready within ~10 minutes; Play Internal Testing within ~5.

If a build fails, the same URL has the full log. Common failure modes are documented at the bottom.

## CI-driven build + submit (GitHub Actions)

Two manual workflows live at `.github/workflows/build-and-submit-{ios,android}.yml`. Trigger them from **Actions → build-and-submit-ios (or -android) → Run workflow**, pick a profile (`preview` or `production`), and toggle the `submit` checkbox off if you want a build without an upload.

The runner only drives the EAS CLI; the actual build runs on EAS macOS/Linux workers, and the artifact is pushed straight to TestFlight or Google Play from EAS without ever touching the runner. Local credentials are not required.

**Prerequisites:**

1. Repo secret `EXPO_TOKEN` — an Expo access token belonging to a wodtech org member. Generate at [expo.dev → Account Settings → Access Tokens](https://expo.dev/settings/access-tokens) and add at **Settings → Secrets and variables → Actions → New repository secret**.
2. The relevant store credentials (App Store Connect API key, Google Play service account JSON) uploaded to the **EAS credential vault** via `eas credentials`. This is [#488](https://github.com/chuckmag/WODalytics/issues/488) Phase 1. Until those are in the vault, the `submit` step will fall back to the file paths in `apps/mobile/eas.json`, which only exist on individual laptops — submit will fail on the runner. Build itself works without it.

**Fallback:** The local `npm run build:*` / `npm run submit:*` scripts (see [Build & submit scripts](#build--submit-scripts) above) keep working and are the right path when CI is unavailable or you want to ship from a branch that hasn't been pushed.

## The first-Android-submission gotcha

The first time you push a new package name (`com.wodalytics.app`) to Google Play, **the API will reject it**. Google requires the first submission to be uploaded manually through the Play Console web UI to verify ownership. After that, the API works for every subsequent release.

If `npm run submit:preview:android` fails with `You haven't submitted this app to Google Play Store yet. The first submission of the app needs to be performed manually`:

1. Pull the latest `preview` build from [the EAS build list](https://expo.dev/accounts/wodtech/projects/wodalytics/builds).
2. Download the `.aab` artifact.
3. Upload it by hand at Play Console → `com.wodalytics.app` → Testing → Internal Testing → Create new release.
4. Once that release is in the testing track, re-run `npm run submit:preview:android` for the *next* build and it will succeed.

This is documented at [expo.fyi/first-android-submission](https://expo.fyi/first-android-submission).

## Dynamic Expo config

`apps/mobile/app.config.ts` is a TypeScript dynamic config that reads `EAS_PROJECT_ID` from `process.env` and only emits `updates.url` / `extra.eas.projectId` when set. Every build profile in `eas.json` injects the project ID, so builds resolve it automatically.

See [`CLAUDE.md` → *Dynamic Expo config*](./CLAUDE.md#dynamic-expo-config--appconfigts) for the full explanation and the local-dev override path.

## Monorepo build-time gotcha (don't touch)

`apps/mobile/package.json` has an `eas-build-post-install` script that compiles `@wodalytics/types` (`tsc` → `packages/types/dist/`) before Metro runs on the EAS worker.

This is required because EAS only runs `npm install` on the build worker — it does not run workspace builds. `@wodalytics/types`'s `main` field points to `dist/index.js`, which doesn't exist after a fresh `npm install`. Without this hook, every EAS build fails with `Unable to resolve module @wodalytics/types`.

**Don't remove or rename the `eas-build-post-install` script** unless you've also removed `@wodalytics/types` from `apps/mobile/dependencies` or migrated it to a source-only import.

## Common failure modes

| Error | Cause | Fix |
|---|---|---|
| `Invalid Apple App Store Connect API Key ID` | `ascApiKeyId` / `ascApiKeyIssuerId` in `eas.json` are placeholders, or the `.p8` file is missing/wrong | Regenerate the key at App Store Connect, update `eas.json`, save the new `.p8` to `apps/mobile/keys/AuthKey.p8` |
| `Unable to resolve module ../../App from .../expo/AppEntry.js` | Metro fell back to Expo's default entry (monorepo entry-point resolution issue) | Verify `package.json` `"main": "index.ts"` is committed and `index.ts` exists |
| `Unable to resolve module @wodalytics/types` | `eas-build-post-install` hook was removed or `packages/types/dist/` failed to build | Re-add the hook; check the EAS log for `tsc` errors in the post-install step |
| `You haven't submitted this app to Google Play Store yet` | First Android submission for a new package | See [The first-Android-submission gotcha](#the-first-android-submission-gotcha) |
| `Cannot create a submission for canceled or errored builds` | The build that `--latest` picked up failed | Look at the EAS build page, fix the underlying build error, re-build, re-submit |

## Follow-ups

- [#479](https://github.com/chuckmag/WODalytics/issues/479) — migrate `app.json` → `app.config.ts` (env-driven projectId), then re-enable `newArchEnabled`
- [#480](https://github.com/chuckmag/WODalytics/issues/480) — complete the first manual Play Console submission, then verify automated `submit:preview:android`
