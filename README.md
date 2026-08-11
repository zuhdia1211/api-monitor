# API & LLM Pulse — Android

Standalone Android build of the API Monitor dashboard. Everything runs on the
device: no Node server, no Termux, no network dependency beyond the provider
APIs being monitored.

## How it differs from the web build

The web version is a React UI talking to an Express server that owns a
better-sqlite3 database. An APK cannot ship a Node process, so this build keeps
the same React UI and moves the server logic into the app:

| Web build | Android build |
| --- | --- |
| `fetch('/api/...')` → Express | `fetch('/api/...')` → `src/local/api.ts` shim |
| `better-sqlite3` (native Node) | `@capacitor-community/sqlite` (native Android) |
| `server/store.ts` (sync) | `src/local/store.ts` (async, same SQL) |
| Scheduler in `server.ts` | Scheduler started in `src/main.tsx` |
| Provider calls from Node (no CORS) | Provider calls via `CapacitorHttp` (no CORS) |

`src/local/api.ts` replaces `window.fetch` at startup and serves any `/api/*`
path locally, returning real `Response` objects. Requests to provider APIs pass
through untouched. Because the request and response shapes are unchanged, the
components under `src/components/` are byte-identical to the web project.

`checker.ts` was copied over as-is. `providers.ts` and `webhook.ts` needed one
change each, described below.

## Why provider calls need native HTTP

In the web build the browser only ever talks to its own Node server, which then
calls the provider — so no cross-origin request is ever made. In the APK there
is no server: the same code runs in a WebView on origin `https://localhost`, so
every provider call is cross-origin and the WebView enforces CORS. Server-side
APIs generally send no `Access-Control-Allow-Origin` header, so the request is
blocked and surfaces only as `TypeError: Failed to fetch` with HTTP status 0 —
indistinguishable from the endpoint being down.

Confirmed against a live gateway: `curl` to `/v1/models` returned HTTP 200 while
the same request from the WebView threw, and the response carried no
`access-control-*` headers.

`src/local/native-fetch.ts` wraps `CapacitorHttp`, which issues the request from
native Android code where CORS does not apply — the position the Node server
occupies in the web build. It returns a normal `Response`, so callers keep using
`res.ok`, `res.status`, `res.json()`, and `res.text()` unchanged, and it falls
back to `window.fetch` in the browser preview. `fetchWithTimeout` in
`providers.ts` and both alert calls in `webhook.ts` route through it.

This buffers the full response body, so it is not suitable for streaming. The
app does not use streaming responses.


## Data persistence

SQLite lives in the app's private storage, so targets, check history,
incidents, chat sessions, and settings survive app restarts. Uninstalling the
app deletes the database. The schema and the migrations match the web build.

## Prerequisites

- Node 22+ (the Capacitor CLI requires it; `nvm use 22`)
- JDK 21 — Android Studio bundles one at
  `/Applications/Android Studio.app/Contents/jbr/Contents/Home`.
  A standalone JDK 17 will fail with `invalid source release: 21`.
- Android SDK with platform 34+

## Build

```bash
nvm use 22
npm install
npm run apk          # vite build + cap sync + gradle assembleDebug
```

If Gradle cannot find a JDK 21:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk` (~24 MB)

## Install

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Or copy the APK to the device and open it (requires "install from unknown
sources").

## Other commands

```bash
npm run dev            # browser preview; SQLite runs on WASM via jeep-sqlite
npm run sync           # rebuild web assets and copy them into the APK project
npm run open:android   # open the project in Android Studio
npm run apk:release    # unsigned release build; needs a signing config
```

## Notes and limitations

- **Background checks only run while the app is open.** The scheduler is a
  WebView timer, so Android suspends it when the app is backgrounded. True
  background monitoring would need a foreground service or WorkManager.
- **The debug APK is signed with the debug key** and is meant for local
  testing. Publishing requires a release keystore.
- The browser preview (`npm run dev`) stores its database in IndexedDB rather
  than a real SQLite file; only the device build uses native SQLite.

## Verified on an emulator

Ran on a Pixel 6 AVD (Android 15, x86_64):

- App launches with no crash and no JavaScript errors.
- `databases/monitorSQLite.db` is created in private storage with all seven
  tables (`targets`, `checks`, `incidents`, `settings`, `chat_sessions`,
  `chat_messages`, `chat_compressions`) and a seeded settings row, so both
  reads and writes reach native SQLite.
- The scheduler starts and polls on its 15-second cycle.
- A live health check against a real OpenAI-compatible gateway discovered 68
  models and probed all 68 (10 operational, 57 returning provider-side errors,
  1 unreachable), matching what the web build reports for the same target.


To recreate the AVD from scratch:

```bash
sdkmanager "system-images;android-35;google_apis_playstore;x86_64" "emulator"
avdmanager create avd -n pulse_test \
  -k "system-images;android-35;google_apis_playstore;x86_64" -d pixel_6
emulator -avd pulse_test -gpu swiftshader_indirect
```

`-gpu swiftshader_indirect` is not optional here. With the default host GLES
path this machine renders the emulator window entirely black — the system is
running normally underneath (`adb exec-out screencap` returns correct frames,
and the app reports as the focused activity), only the on-screen window never
paints. Software rendering costs some frame rate and fixes the blank window.

## Phone layout

The dashboard was built for a desktop viewport, so the tables it uses do not
fit a portrait phone. Below Tailwind's `md` breakpoint:

- `TargetList` hides its eight-column table and renders the same rows as
  `TargetCard` stacks.
- `ModelMonitor` hides its seven-column table and renders one collapsed row per
  model showing just the model id, endpoint name, and a status dot. Tapping a
  row reveals status, latency, tested time, the full response or error text
  (wrapped, not truncated), and the Ping Test / Chat Test buttons. With 68
  models the collapsed list measured 48 px per row, so roughly 14 fit on screen
  at once instead of one card.

- `Navbar` moves its controls onto a second row, and the tab bar wraps.

Measured in the running WebView at a 412 px viewport with data present:
`document.scrollWidth` equals the viewport width on every tab, and no element
extends past the right edge.

