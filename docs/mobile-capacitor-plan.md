# MediBridge Mobile — Capacitor Application Plan

- **Status**: Proposed — research complete, nothing executed. No code changes made beyond this document.
- **Research date**: 2026-08-26 (all versions re-verified against npm registry and official docs that day).
- **Document saved**: 2026-08-30.
- **Scope**: wrapping the existing static SPA in `ui/` into iOS/Android binaries with Capacitor 8. The FastAPI backend (agent, tools, data pipeline, `/api` contract) is unchanged in every step of this plan.

## Purpose and context

MediBridge today is a Python backend (FastAPI + LangGraph ReAct agent + SQLite/Chroma) with a thin, no-build React 18 SPA in `ui/` served as static files. The goal is a mobile application with the least possible change to the existing system.

**Why Capacitor (and not Swift/Flutter/React Native):**

- Swift: iOS-only — a second codebase (Kotlin) would be needed for Android; zero reuse from a Python + React repo.
- Flutter: excellent greenfield option, but Dart overlaps with nothing here; the entire UI would be a rewrite.
- React Native/Expo: the existing React code is not portable (UMD + in-browser Babel, DOM JSX, no build toolchain) — "React" transfers only as concepts, not code; it would introduce the repo's first npm/Metro build chain for a full UI rewrite.
- Capacitor: reuses 100% of the existing, already mobile-styled UI; the backend is already a clean JSON + SSE API; it ships real iOS/Android binaries. The investment transfers 1:1 to an Expo rewrite later if native UX becomes the priority (named decision gate in Phase 6).

Ionic Framework itself is **not** required — Capacitor alone drops into any static web app. We keep the existing UI rather than rebuilding screens with Ionic components.

## Repo facts this plan is built on (verified 2026-08-26)

- `ui/` inventory: `index.html`, `api.js`, `tokens.js`, `shell.jsx`, `app.jsx`, `screens/{chat,calc,onboarding,clinics-profile}.jsx` — 9 files, no CSS/image/font assets, no package.json anywhere in the repo.
- Runtime CDN dependencies (all in `ui/index.html`): `unpkg.com/react@18.3.1/umd/react.production.min.js`, `react-dom@18.3.1/umd/...`, `@babel/standalone@7.29.0/babel.min.js` (lines 54–56); Fontshare fonts (lines 10–11), Google Fonts `JetBrains Mono` (lines 12–14).
- Zero webview-hostile APIs in `ui/`: no `localStorage`, `sessionStorage`, `serviceWorker`, `navigator.*`, `document.cookie`, `EventSource`, or `WebSocket`. Only benign globals: `window.api` (`ui/api.js:83`) and `window.MB` (`ui/tokens.js:2`).
- Exactly two `fetch()` call sites in `ui/api.js`: line 6 (`_request`, used by all JSON endpoints) and line 34 (`chatStream`, `POST /api/chat` SSE). All endpoint paths are root-relative.
- `src/medibridge/server/main.py`: no CORS middleware; routers mounted under `/api`; static mount of `ui/` at `/` (`WEB_DIR = ROOT_DIR / "ui"`); binds `0.0.0.0`, port from `PORT` env (default 8000). Lifespan hard-fails without `data/medibridge.db` and `OPENAI_API_KEY`.
- `.gitignore` covers `.env`, `.venv/`, `__pycache__/`, `*.pyc`, `*.egg-info/`, `data/user_profile.json`, `.pytest_cache/`, `build/`, `dist/`, `.claude/`, `graphify-out/`. It does **not** cover `node_modules/`, `www/`, `ios/`, `android/` (see Phase 2).
- Dockerfile + `docker-entrypoint.sh` exist (`python:3.11-slim`, bakes `data/` into the image, `EXPOSE 8000`). No docker-compose, no `.dockerignore`, no CI workflows (no `.github/` at all).
- No icon/splash/image assets exist anywhere in the repo — all must be sourced from scratch (Phase 4).
- Clinic search is Queensland-only (postcode/suburb filters); `phone`/`hours`/`latitude`/`longitude` are NULL across the dataset and dropped from tool output. Unaffected by the mobile work (API unchanged).
- Backend limitation to resolve before public launch: single global user profile (`user_profile id=1`, hardcoded in `profile.py`, `agent/prompts.py`, `tools/coverage_calculator.py`) and no auth on the HTTP layer.

## Verified version matrix (2026-08-26)

| Package / requirement | Version | Notes |
|---|---|---|
| `@capacitor/core`, `@capacitor/cli` | 8.5.0 | Current stable |
| Node.js | >= 22 | CLI engine requirement |
| Xcode | 26.0+ | iOS builds |
| Android Studio | 2025.2.1+ | minSdk 24, compile/target SDK 36 |
| iOS deployment target | 15.0 | |
| iOS package manager | Swift Package Manager (default in v8) | CocoaPods via `cap add ios --packagemanager CocoaPods` |
| `@ionic/core` | 9.0.0 | Not needed for this plan |
| Plugins (optional v1) | `@capacitor/splash-screen` 8.0.2, `@capacitor/keyboard` 8.0.5, `@capacitor/app` 8.1.1 | Later: `@capacitor/push-notifications` 8.1.2, `@capacitor/preferences` 8.0.1 |

Capacitor 8 change to respect: `@capacitor/android` and `@capacitor/ios` must be installed via npm **before** `cap add`.

---

## Phase 0 — Environment and prerequisites

Goal: a machine and a backend that can support native builds and on-device testing.

1. **Install Node.js 22+.** This is a known blocker: the MCP registry's `androidbuild-mcp` spawn failed with `npx` not found on the dev host, and the shell was gated during research, so Node/JDK presence is unverified. First step in a shell-capable session:
   ```powershell
   node --version; npm --version; java -version
   ```
2. **Android**: install Android Studio 2025.2.1+ (bundles the JDK and SDK). Verify the SDK path (`%LOCALAPPDATA%\Android\Sdk` by default).
3. **iOS**: a Windows machine cannot build iOS. Plan on a Mac, or CI (GitHub Actions macOS runner, Phase 6). `cap add ios` can be generated on any OS; *building/signing* needs macOS.
4. **Backend reachability**: the app needs a deployed HTTPS API URL. The Dockerfile exists and the Docker/Railway deployment path is documented in the README (`OPENAI_API_KEY`, `PORT` env vars; pre-built DB ships in the image). Local `http://localhost:8000` only works on the Android emulator with a debug-only cleartext exception (Phase 3).
5. **Decision gate — auth/multi-user**: the backend has a single global profile (`user_profile id=1`) and no auth. Two testers on one staging deployment will overwrite each other's profile. Acceptable for a first internal build; must be resolved before any public release. Resolution sketch (separate work item, out of scope of this plan): user-scoped profile rows + token auth middleware (Supabase/Firebase Auth or simple JWT), touching `data/schema.py`, `profile.py`, `agent/prompts.py`, `tools/coverage_calculator.py`, and the profile routes.
6. **Store accounts** (before Phase 5, not blocking Phases 1–4): Google Play Console account and Apple Developer Program membership (both have fees).

## Phase 1 — Harden the web UI (shared by web + mobile)

Goal: one hardened asset set that the FastAPI web app and the Capacitor bundle both use, with no runtime CDN dependency and a configurable API base URL.

1. **Stop shipping Babel Standalone.** It is a multi-MB in-browser compiler — slow startup on device and an app-review risk. Precompile the JSX once with esbuild. The npm tooling lives only in the new `mobile/` project (Phase 2); run the build from there:
   ```bash
   npm i -D esbuild react@18.3.1 react-dom@18.3.1
   npx esbuild ui/app.jsx --bundle --jsx=automatic --minify \
     --outfile=ui/app.bundle.js --format=iife
   ```
   (`ui/app.jsx` imports the screens; esbuild resolves the relative imports in one pass.)
2. **Bundle React UMD locally** into `ui/vendor/`: copy `node_modules/react/umd/react.production.min.js` and `node_modules/react-dom/umd/react-dom.production.min.js`. Delete the three unpkg `<script>` tags and the Fontshare/Google `<link>` tags from `ui/index.html` (fall back to system font stacks already declared in the CSS). `index.html` then loads `vendor/…` + `app.bundle.js` — no runtime network dependency, offline-capable.
3. **API base URL injection** — the only functional UI change: 2 lines + 1 new file.
   - New `ui/config.js`:
     ```js
     // Same-origin (web) by default; the mobile build overwrites apiBase with the deployed API.
     window.MB_CONFIG = window.MB_CONFIG || { apiBase: '' };
     ```
   - `ui/api.js`: add `const API_BASE = (window.MB_CONFIG && window.MB_CONFIG.apiBase) || '';` and change the two fetch calls — line 6 `fetch(API_BASE + path, …)` and line 34 `fetch(API_BASE + '/api/chat', …)`. Everything else flows through those two sites.
4. **Keep the web app working**: no server change is required — `main.py` still mounts `ui/`. The hardened `index.html` is what browsers and the webview both load.
5. **Acceptance criteria**: `medibridge` serves the hardened UI; onboarding → chat (SSE) → calc → clinics all pass in a desktop browser; `data/` DB and `knowledge/` untouched; DevTools network tab shows zero external hosts.

## Phase 2 — Scaffold the Capacitor project (`mobile/`)

Goal: a new top-level `mobile/` npm project that owns the Capacitor CLI, the esbuild build script, and the native projects.

1. **`.gitignore` additions** (append to root `.gitignore`):
   ```gitignore
   # Mobile (Capacitor)
   node_modules/
   mobile/www/
   ```
   Note: the existing unanchored `build/` and `dist/` patterns already cover `mobile/build/` and `mobile/dist/`. For the native projects choose one policy:
   - **Commit them** (Capacitor-recommended): ignore only the generated internals — `mobile/ios/App/Pods/`, `mobile/ios/DerivedData/`, `mobile/android/.gradle/`, `mobile/android/app/build/`, `mobile/android/local.properties`, `mobile/android/.idea/`, `mobile/android/captures/`.
   - **Ignore them wholesale** (`mobile/ios/`, `mobile/android/`): simplest; `cap add` regenerates them, but per-developer local native tweaks are lost.
2. **Scaffold** (verified v8 sequence):
   ```bash
   cd mobile
   npm init -y
   npm i @capacitor/core
   npm i -D @capacitor/cli esbuild react@18.3.1 react-dom@18.3.1
   npx cap init "MediBridge" <appId> --web-dir ../ui
   npm i @capacitor/android @capacitor/ios
   npx cap add android
   npx cap add ios        # generated on any OS; build/sign needs macOS
   npx cap sync
   npx cap open android   # or: npx cap run android
   ```
   `webDir` points at `../ui` — because the hardened `index.html` lives at `ui/` root, web and mobile share one asset source; no `www/` copy step is needed.
3. **Add a build script** in `mobile/package.json`:
   ```json
   "scripts": {
     "build:web": "esbuild ../ui/app.jsx --bundle --jsx=automatic --minify --outfile=../ui/app.bundle.js --format=iife",
     "sync": "npm run build:web && cap sync"
   }
   ```
4. **appId decision**: must be a reverse-domain name you own (e.g. `au.com.medibridge.app`). It is baked into both native projects — decide before Phase 5 (see Open decisions).
5. **Acceptance criteria**: debug APK installs on an emulator/device and renders the bundled UI with the network disabled (airplane-mode test); `npx cap sync` completes without errors.

## Phase 3 — Connectivity (the SSE/CORS crux)

Goal: the webview reaches the deployed FastAPI over HTTPS, including the streaming chat endpoint.

Research findings that shape this phase:

- CORS **is** enforced in WKWebView and Android WebView for cross-origin `fetch` from `capacitor://localhost` (iOS) / `https://localhost` (Android).
- `EventSource` is GET-only — unusable for the POST `/api/chat` contract.
- Capacitor's `CapacitorHttp` native-fetch plugin **breaks SSE** (upstream issue ionic-team/capacitor#6582) — it is off-limits for this app because chat depends on the event stream.
- The existing `fetch` + `ReadableStream` parser in `ui/api.js` (`chatStream`) is exactly the right approach and needs no changes beyond the base URL.

Steps:

1. **Add CORS middleware to FastAPI** (`src/medibridge/server/main.py`, currently none). Allow the app's origins plus the dev live-reload origin:
   ```python
   from fastapi.middleware.cors import CORSMiddleware

   app.add_middleware(
       CORSMiddleware,
       allow_origins=["capacitor://localhost", "https://localhost", "http://localhost:8100"],
       allow_methods=["*"],
       allow_headers=["*"],
   )
   ```
   (Tighten to the deployed API's exact origins once they exist; the desktop web build stays same-origin and is unaffected.) Do **not** enable `CapacitorHttp`.
2. **Bundled-mode config**: needs *no* `server.*` settings — assets load from the app bundle, and HTTPS API calls need nothing extra on iOS (ATS has no issue with https; no `NSAllowsArbitraryLoads` exceptions required).
3. **Dev live-reload config** (`server.url` is documented for live reload only, not production):
   ```ts
   // capacitor.config.ts — dev only, must not reach production builds
   server: { url: 'http://<your-LAN-IP>:8000', cleartext: true },
   ```
   Alternatively run `npx cap run --url http://<your-LAN-IP>:8000`. Android blocks cleartext by default (API 28+); for emulator dev against a local FastAPI, add a **debug-only** `network_security_config.xml` with `cleartextTrafficPermitted="true"` (or `android:usesCleartextTraffic="true"` in a debug manifest overlay) — never in release builds.
4. **Point the app at the deployed API**: the mobile build's `ui/config.js` gets `apiBase: 'https://api.<your-domain>'`. Mechanism suggestion: a tiny sed/script in the mobile build pipeline that writes the value before `cap sync`, keeping the checked-in default same-origin.
5. **Acceptance criteria**: on-device test of the full chat loop — SSE events (`tool_call` → `tool_result` → `assistant_message` → `done`, `error` on failure) stream correctly on the oldest supported OS (iOS 15.0 / Android 60+ WebView). Fallback if fetch-streaming misbehaves on a specific OS: `@microsoft/fetch-event-source` (supports POST, headers, body, retry control).

## Phase 4 — Native polish and assets

Goal: a store-reviewable, app-feeling shell around the existing UI.

1. **Icon + splash from scratch** — the repo has zero image assets. Generate with `@capacitor/assets`: source one 1024x1024 icon and one splash art file, then:
   ```bash
   npm i -D @capacitor/assets
   npx @capacitor/assets generate --iconBackgroundColor '#F5F6F0'
   ```
2. **Safe area / status bar**: Capacitor 8's SystemBars plugin injects `--safe-area-inset-*` CSS variables; the SPA already uses safe-area insets, so verify rendering first, then set status bar style via `@capacitor/status-bar`. (v8 removed `android.adjustMarginsForEdgeToEdge` — handled by the plugin now.)
3. **Android back button**: wire `@capacitor/app`'s `backButton` event to step back through screens (the SPA's `useState` screen switch) instead of closing the app on the root screen.
4. **Chat input UX**: add `@capacitor/keyboard` for resize and keyboard-dismiss handling around the chat input.
5. **Splash screen**: `@capacitor/splash-screen` to hold the branded splash until first render (hide on the app's mount).
6. **In-app disclaimer**: MediBridge is informational-use-only (per the README warning). Surface a short disclaimer during onboarding and in the profile screen — important for a health-cost app and for store review.
7. **Acceptance criteria**: icon/splash render on both platforms; back button behaves per-platform; the keyboard does not cover the chat input; safe areas are correct on a notched device; the disclaimer is visible in onboarding.

## Phase 5 — Signing and store distribution

Goal: real signed builds in the hands of testers.

1. **Android**:
   - Generate a release keystore (store credentials in the team secret manager, never in the repo).
   - Build a signed AAB: `npx cap build android` (or Gradle `bundleRelease`), or configure signing in `android/app/build.gradle`.
   - Upload to **Play Console internal testing** (up to ~100 testers, fast loop).
   - Mandatory: complete the **Data Safety form** — declare that chat/profile/health-cost data is transmitted to your server — and provide a privacy policy URL.
   - Note: new personal Play accounts face Google's closed-testing prerequisite (12 testers / 14 days per current guidance — unverified; confirm in Play Console before submission).
2. **iOS**:
   - Apple Developer account, certificates, and provisioning profiles.
   - Build on a Mac or macOS CI; upload via **TestFlight** (internal testing first).
3. **Apple Guideline 4.2 risk** (webview wrappers rejected as "repackaged websites"). Mitigations, in order of leverage:
   - Native splash, icon, and back-button behavior now (this phase).
   - **Push notifications later** — the strongest native signal (`@capacitor/push-notifications`).
   - Genuinely app-like function: the existing bottom-tab structure and offline-capable bundled UI help.
   - Privacy manifest (`PrivacyInfo.xcprivacy`): **not required** for this app — no third-party SDKs and no required-reason API usage. Re-check if plugins with SDK dependencies are added.
4. **Acceptance criteria**: signed AAB installs on a physical Android device; TestFlight build installs on a physical iPhone; both pass the Phase 6 QA checklist against the production API.

## Phase 6 — CI and verification (after the first manual build works)

Goal: reproducible builds and a repeatable QA gate.

1. **GitHub Actions** (none exists today):
   - Job 1 (ubuntu): checkout → setup Node 22 → `npm ci` in `mobile/` → `npm run build:web` → `cap sync` → Android release build (upload AAB artifact).
   - Job 2 (macos runner): same web build + `cap sync` → iOS build via `xcodebuild` (upload archive artifact). Signing secrets via encrypted env/secret manager.
   - Backend deploy job (Docker → Railway) unchanged.
2. **QA checklist** (run on both platforms, oldest supported OS included):
   - SSE streaming end-to-end (all event types, final answer, error path).
   - Onboarding + profile save/load against the deployed API.
   - Coverage calculation for a known item (cross-check against the coverage calculator tests).
   - Clinic search (postcode/suburb/type/billing filters).
   - Airplane-mode asset load (bundled UI renders; API calls fail gracefully with a visible error).
   - App background/resume mid-chat-stream; cancel a chat while streaming; rotate mid-stream.
   - CORS verified from both platform schemes.
3. **Native-upgrade decision gate** (post-launch): if user feedback demands native UX, push, or offline-first behavior, port the four screens to Expo/React Native against the same API — `ui/api.js` becomes the interface spec. If not, extend the Capacitor shell with plugins.
4. **MCP registry options for this phase**: `androidbuild-mcp` (Gradle/emulator/adb automation) and `tapp`/`appium-mcp` (mobile QA) are available in the MCP registry and fit the build/QA steps. `androidbuild-mcp` failed to start during research only because `npx` was missing from PATH; retry after Node is installed (Phase 0).

## Open decisions (needed from the owner)

- **App ID / domain**: which reverse-domain `appId`, and the org name for store listings?
- **Auth/multi-user**: fix the `id=1` single profile now, or accept single-profile for internal testing?
- **iOS build hardware**: Mac available, or should CI cover it?
- **Deployed API URL**: target domain/region for the backend (Railway, or elsewhere)?

## Unverified / risk register

- Node/JDK/Android Studio presence on the dev machine (shell was gated during research).
- Play Console's exact new-account closed-testing thresholds.
- WKWebView / Android WebView streaming support on the very oldest supported OS versions — verify on-device in Phase 3 before relying on it.
- `server.*` live-reload config must never ship in production builds (add a release-check to the CI job).
- Apple 4.2 review outcome is discretionary — treat push notifications as the planned mitigation, not a guarantee.
- All version numbers and CLI sequences came from primary sources fetched 2026-08-26 (npm registry, capacitor-docs, Apple/Android developer docs); re-check before execution if weeks have passed.

## Deleting this plan document

This file is documentation only — it contains no code, and deleting it does not affect any work done so far (nothing in this plan has been executed).

To delete it:

```powershell
# Windows PowerShell (from repo root)
Remove-Item docs/mobile-capacitor-plan.md
# or, if the file was committed:
git rm docs/mobile-capacitor-plan.md
git commit -m "docs: remove Capacitor mobile plan"
```

Notes:

- Removing this document does **not** remove the `mobile/` directory, the `ui/` hardening changes, the CORS middleware, or any other artifacts created while executing the plan. Those are separate deletions/reverts (see Phases 1–3).
- As of saving, no README or other document links to this file, so no cross-references need updating when it is removed.
- If the plan was executed and is no longer wanted, prefer archiving the decisions (or replacing it with a short ADR/summary) over silent deletion, so future maintainers know why the mobile shell exists.
