# LeadFlow → iOS + Android App: Roadmap

Goal: ship LeadFlow to the Apple App Store and Google Play **without rewriting** the app.
Approach: wrap the existing web app with **Capacitor** (native shell around your HTML/CSS/JS),
add the native features the stores require, and fix the few things that genuinely break inside
a native webview.

This doc is ordered so each phase unblocks the next. Each item lists **What**, **How to fix
(with file refs)**, and **Done when**.

---

## Current state (audited)

- ~14 page bundles (`index/dashboard`, `leads`, `clients`, `contacts`, `calls`, `calendar`,
  `campaigns`, `messages`, `reports`, `settings`, `tasks`, `realtors`, `login`, `realtor` portal).
- Shared chrome rendered by `js/layout.js` (left **sidebar** + topbar), injected per page.
- Data shown in wide **`.lf-table`** tables → desktop-first.
- `css/styles.css` has **0 media queries**; responsiveness is a few ad-hoc Tailwind `lg:` prefixes.
- **No** `manifest.json`, **no** service worker.
- Auth = **HTTP-only cookie sessions**, same-origin (`server.js`).
- Email backend = **per-user Google OAuth** via a server-side redirect (`/api/google/connect`).

The four real blockers, in priority order: **(1) Google OAuth dies in a webview**,
**(2) cookie auth breaks if the app is bundled (cross-origin)**, **(3) the UI isn't mobile-responsive**,
**(4) Apple rejects bare website wrappers** (need real native features).

---

## Phase 0 — Decisions & accounts (do first, ~1 day)

- **Shell choice:** Capacitor for **both** platforms (keeps iOS + Android identical). Android could
  alternatively use a TWA, but don't split the stack.
- **App-loading model — decide now, it drives Phases 1–2:**
  - **Model A — "remote URL":** the app shell just loads `https://leadflow-536t.onrender.com`.
    Cookies + same-origin keep working; least change. Downsides: no offline, slower first paint,
    and Apple scrutinizes "it's just our website" harder.
  - **Model B — "bundled assets" (recommended):** ship the HTML/JS/CSS *inside* the app
    (origin `capacitor://localhost`), call `/api/*` cross-origin. Faster, offline-capable, more
    "app-like" → smoother Apple review. **Cost:** you must add CORS + switch auth to tokens (Phase 2).
  - Recommendation: **Model B.** It's a bit more work now but removes the cookie/SameSite pain and
    is what passes review cleanly.
- **Accounts:** Apple Developer Program ($99/yr) + Google Play Developer ($25 one-time).
- **iOS build machine:** a Mac with Xcode, **or** a cloud-Mac CI (Codemagic / Ionic Appflow /
  GitHub Actions macOS runner). Android builds fine on Windows via Android Studio.
- **Done when:** accounts created, model chosen, a Mac/CI path picked.

--- 

## Phase 1 — Make the web app mobile-responsive (the long pole)

This is the biggest chunk of work and is independent of any native code — you can ship it to the
website first and verify in a phone browser.

### 1a. Global breakpoint + the sidebar → mobile nav
- **What:** the `js/layout.js` left sidebar wastes the screen on phones.
- **How:**
  - Add a single breakpoint convention (e.g. `@media (max-width: 768px)`) in `css/styles.css`.
  - Below it: hide the sidebar, add a **hamburger** in the topbar that opens the sidebar as an
    **off-canvas drawer** (slide-in + backdrop), OR convert to a **bottom tab bar** for the 4–5
    primary sections (Dashboard, Leads, Contacts, Calls, More). Bottom tabs feel the most native.
  - Do it once in `layout.js` so every page inherits it. The realtor portal (`realtor.html` /
    `js/realtor.js`) has its own shell — give it the same treatment separately (it already uses
    some `lg:` prefixes, so it's partway there).
- **Done when:** every page is usable one-handed on a 390px-wide screen; no horizontal scroll of
  the whole page.

### 1b. Tables → card lists on mobile
- **What:** `.lf-table` (Leads, Contacts, Past Clients, Realtors, Tasks, Messages) overflow badly.
- **How (pick per table):**
  - **Quick win:** wrap each table in `overflow-x:auto` (some already are) so it scrolls
    horizontally. Acceptable for dense/admin tables, poor for primary ones.
  - **Proper fix:** below the breakpoint, render each row as a **stacked card** (name + key fields +
    the action buttons). Add a `.lf-table--cards` CSS mode using
    `@media (max-width:768px){ table, thead, tbody, tr, td { display:block } thead{display:none} td::before{content:attr(data-label)} }`
    and add `data-label` to the `<td>`s in each page's render function.
  - Priority order (most-used first): **Leads → Contacts → Past Clients → Realtors → Tasks**.
- **Done when:** those five lists read as tap-friendly cards on a phone, with working row actions.

### 1c. Modals → bottom sheets / full-screen on mobile
- **What:** centered fixed-width modals (lead modal, edit modals, chat, log-call) overflow small
  screens. The realtor lead modal is already `max-width:620px` — fine on desktop, cramped on phone.
- **How:** below the breakpoint, make modals `position:fixed; inset:0` full-screen (or a bottom sheet
  that slides up), with their own scroll. One shared CSS rule covers most since they share structure.
- **Done when:** every modal/form is fully reachable and submittable on a phone, keyboard open.

### 1d. Touch, safe areas, and inputs
- **How:**
  - Tap targets ≥ **44×44px** (bump icon buttons that are 26–30px).
  - Add **safe-area insets** for notch/home-bar: `padding: env(safe-area-inset-top) ... ` on the
    topbar and bottom nav; set `<meta name="viewport" ... viewport-fit=cover>`.
  - Use correct input types/`inputmode` (tel/email/number) so the right keyboard appears — check the
    add/edit forms in `leads.js`, `contacts.js`, `realtor.js`.
  - Remove hover-only interactions (right-click menus, hover dropdowns) — convert to tap.
- **Done when:** no fat-finger misses; content clears the notch and home indicator.

### 1e. Calendar & Reports
- **What:** `calendar.js` grid and `reports.js` charts are the hardest to fit.
- **How:** calendar → switch to a **day/agenda list** view on phones (month grid is unusable small);
  reports → stack cards vertically, make any charts width-responsive.
- **Done when:** both are legible and scrollable on a phone without pinch-zoom.

**Phase 1 effort:** the dominant cost of the whole project. Budget per-page; the shared `layout.js` +
`styles.css` work benefits every page at once, so do that first, then sweep pages by priority.

---

## Phase 2 — Fix auth & OAuth for native (the critical blockers)

### 2a. Google OAuth must leave the webview ⚠️
- **What:** Google **blocks OAuth inside embedded webviews** (`disallowed_useragent`). Your Gmail
  connect (`/api/google/connect` → Google → callback) will fail inside the app. This affects the
  whole email feature.
- **How:**
  - In the app, open the OAuth URL in the **system browser**, not the webview: use
    `@capacitor/browser` (Chrome Custom Tab / `SFSafariViewController`) or native
    `ASWebAuthenticationSession` (iOS) / Custom Tabs (Android).
  - Add a **deep-link / custom URL scheme** (e.g. `leadflow://oauth-callback`) and register it in both
    native projects; have the OAuth **callback redirect back** into the app via that scheme.
  - **Server changes (`server.js`):** allow the deep-link redirect URI in the Google client config,
    and make the `/api/google/connect` + callback accept a "native" flow that 302s to
    `leadflow://oauth-callback?...` instead of an in-app HTML redirect. Keep the existing web flow too.
  - Add the new redirect URI in the **Google Cloud Console** OAuth client.
- **Done when:** on a real device, "Connect Gmail" opens the system browser, completes, and returns
  to the app signed-in.

### 2b. Auth model for a bundled app (only if Model B)
- **What:** if the frontend is bundled (`capacitor://localhost`), every `/api/*` call is **cross-origin**,
  so HTTP-only same-site cookies won't be sent.
- **How (recommended): add token auth alongside cookies.**
  - On `/api/login`, also return a **bearer token** (signed JWT or an opaque session token row).
  - Accept `Authorization: Bearer <token>` in the session-loading middleware in `server.js`
    (fall back to the existing cookie path so the website is unchanged).
  - Store the token in the app via `@capacitor/preferences` (or Keychain/Keystore) and attach it to
    every `fetch`. The app's `api()` helpers (e.g. `js/realtor.js` `api()`, and each page's `fetch`)
    get a shared wrapper that adds the header.
  - Add **CORS** for the app origin and `OPTIONS` preflight handling in `server.js`.
  - If you instead keep cookies, you must set `SameSite=None; Secure` and prove the webview persists
    them — more fragile than tokens. Prefer tokens.
- **Done when:** login works from the bundled app and sessions persist across app restarts.

### 2c. "Sign in with Apple" (conditional)
- **What:** current login is email/password — fine. **But** if you add "Sign in with Google" *for app
  login*, Apple Guideline **4.8** generally requires you to **also** offer **Sign in with Apple**.
- **How:** only if you add social login — then add Apple as an option too. Otherwise skip.
- **Done when:** N/A unless you add social login.

### 2d. Account deletion (Apple requirement)
- **What:** Apple requires **in-app account deletion** for apps that create accounts.
- **How:** add a "Delete my account" action in Settings → endpoint in `server.js` that removes the
  user + cascades (your tables already use `ON DELETE CASCADE`).
- **Done when:** a user can delete their account from inside the app.

---

## Phase 3 — Wrap with Capacitor + add native features

Apple **rejects bare website wrappers** (Guideline **4.2**, minimum functionality). The fix is to add
real native value — and these are genuinely useful for a CRM.

### 3a. Capacitor shell
- **How:** `npm i @capacitor/core @capacitor/cli`, `npx cap init`, `npx cap add ios`,
  `npx cap add android`. Point `capacitor.config` at bundled `webDir` (Model B) or `server.url`
  (Model A). Configure the custom URL scheme from 2a.
- **Done when:** the app builds and runs on an iOS simulator and an Android emulator.

### 3b. Push notifications (the headline native feature)
- **What:** ties directly into your existing reminders/automations (follow-ups, birthdays,
  hot-lead-going-cold, daily digest). This is the feature that justifies the app to Apple **and**
  to users.
- **How:**
  - `@capacitor/push-notifications`; **APNs** (iOS) + **FCM** (Android).
  - Add a `device_tokens` table + `POST /api/devices/register` in `server.js`; store per-user tokens.
  - In your automation generators / cron dispatcher (`/api/cron/dispatch`), when a task/reminder is
    created or due, **send a push** via APNs/FCM in addition to (or instead of) the in-app surfacing.
  - Respect a per-user notifications toggle (you already have `auto_tasks_enabled`-style prefs).
- **Done when:** a due follow-up or new shared lead produces a real push on a device.

### 3c. Biometric unlock
- **How:** a biometric plugin (Face ID / fingerprint) gating app open after first login. Cheap, and
  adds native credibility.
- **Done when:** reopening the app prompts Face ID/fingerprint.

### 3d. Nice-to-haves (optional)
- Native share, click-to-call (your `telLink` already produces `tel:`), haptics, offline read cache
  via the service worker from Phase 1.

---

## Phase 4 — PWA, store assets & compliance

### 4a. PWA manifest + service worker (also helps Android/offline)
- **How:** add `manifest.json` (name, icons, `display:standalone`, theme color) and a service worker
  (`sw.js`) for an offline shell + asset caching; register it from `layout.js`. Required if you ever
  do the Android-TWA route; useful regardless.
- **Done when:** Lighthouse PWA checks pass; app works briefly offline.

### 4b. Icons, splash, screenshots
- **How:** one 1024×1024 master icon → generate all sizes (`@capacitor/assets` automates icons +
  splash). Capture **screenshots** for required device sizes (iPhone 6.7"/6.5"/5.5", iPad, Android
  phone/tablet).
- **Done when:** all icon/splash/screenshot assets generated and added to both projects.

### 4c. Privacy & data declarations (don't underestimate)
- **Privacy policy URL** — mandatory both stores.
- **Apple App Privacy "nutrition labels"** + **Google Play Data Safety form** — declare what you
  collect: names, phones, emails, **Gmail content/contacts**. Be accurate; mismatches = rejection.
- **Google OAuth verification:** publishing an app that uses Gmail/Contacts scopes may require
  **Google's OAuth app verification / CASA security assessment** (can be slow/costly for *restricted*
  scopes). **Action:** audit the exact scopes you request and **request the narrowest** that work
  (e.g. send-only vs full mail read) to minimize review burden.
- **Content rating** questionnaires (both stores).
- **Done when:** policy published, both data forms drafted, scope list minimized and documented.

---

## Phase 5 — Beta → submit → launch

- **iOS:** TestFlight internal/external testing → App Store submission.
- **Android:** Play **Internal testing** track → Closed → Production.
- **Plan for rejections.** Most likely causes for *this* app:
  - Apple **4.2** (wrapper) → mitigated by push + biometrics + account deletion (Phase 3/2d).
  - Privacy-label/Data-Safety mismatch → fix declarations.
  - OAuth-in-webview → fixed in 2a.
  - Missing account deletion → fixed in 2d.
- **Timelines:** Apple review ~1–3 days (first try often bounces); Google usually faster but Data
  Safety + Gmail-scope verification are the friction.
- **Done when:** both apps approved and live.

---

## Phase 6 — Release & maintenance

- **OTA updates:** because your UI is web, ship most updates **without store review** via Capacitor
  live updates (Ionic Appflow / Capgo). **Native** changes (new plugins, the OAuth scheme, push) still
  need a store submission.
- **CI:** automate iOS (cloud-Mac) + Android builds and store uploads (Fastlane / Appflow / Codemagic).
- **Versioning:** keep web + native version numbers in lockstep; gate native-only features behind a
  capability check so the plain website ignores them.

---

## Critical-path summary (what actually blocks "ship")

1. **OAuth out of the webview + deep link** (2a) — without it, email is broken in-app.
2. **Token auth + CORS** if bundling (2b) — without it, you can't even log in.
3. **Responsive pass** (Phase 1) — without it, it's unusable on a phone and Apple may bounce it.
4. **One real native feature, ideally push** (3b) — clears Apple 4.2 and is the user-facing win.
5. **Account deletion + privacy declarations + Gmail-scope minimization** (2d, 4c) — review gates.

Everything else is polish or automation. Recommended order to actually work in:
**Phase 1 (responsive) → 2a/2b (auth+OAuth) → 3a/3b (shell+push) → 4 (assets+compliance) → 5 (submit).**
