# Release Workflow

Apps installed from the GitHub release only see an update when the **installed
version** is lower than the **latest release tag**. The in-app checker compares
semver against `android/app/build.gradle`'s `versionName`, so a release is
invisible to devices unless both are bumped together.

## Rule

> **Every change ships with a version bump.** No release with the same
> `versionName` as the previous one.

- `versionName` = the visible version (what the app banner shows, e.g. `1.0.4`).
- `versionCode` = monotonically increasing integer (Android uses it for
  downgrade protection); always `+1` from the previous release.

If you build an APK but do **not** bump, existing devices will show
"Sudah versi terbaru" and never receive it.

## Steps

1. Bump `android/app/build.gradle`:

   ```gradle
   versionCode 6
   versionName "1.0.5"
   ```

2. Build both flavors (debug for local testing, release for distribution):

   ```sh
   export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
   cd android
   ./gradlew assembleDebug assembleRelease
   ```

3. Verify the release APK is signed with the **same keystore** as every
   previous release (`api-pulse-release.jks`). A different signature forces
   devices to uninstall first — data loss.

4. Commit + push the version bump.

5. Create the GitHub release **with the same version as `versionName`**:

   ```sh
   gh release create v1.0.5 \
     android/app/build/outputs/apk/release/API-Pulse-v1.0.5.apk \
     --title "v1.0.5" --notes "…what changed…"
   ```

6. Devices with `updateCheckUrl` set to the repo will show the banner within
   seconds (or on next foreground / 6-hour check).

## Checksum (optional but recommended)

Attach the SHA-256 so users can verify the download:

```sh
shasum -a 256 android/app/build/outputs/apk/release/API-Pulse-v1.0.5.apk
```

## Gotchas

- **`versionName` and the release tag must match.** `versionName "1.0.5"` with
  tag `v1.0.5` is the canonical pairing. If they drift, semver comparison uses
  `versionName` and the banner may show the wrong "newest" number.
- **Never reuse a deleted release tag.** Replacements must be a new tag.
- **Same signing key, always.** The keystore + `keystore.properties` are
  git-ignored; losing them makes future updates impossible on installed
  devices.
