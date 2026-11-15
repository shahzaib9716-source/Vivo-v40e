# Haven — architecture and feature map (contributor orientation)

A map of the codebase so you don't have to read every file. It covers what the app is, the tools
it is built with, where the backend lives, and the start/end points of each feature.

> **Scope boundary — read this first.** Six screens (Calls, Messages, Social, Browsing History,
> Video History, Keyword Alerts) are intentionally **preview-only**: they show made-up rows and
> read nothing from a device. This document does **not** describe how to make them read real
> calls, messages, or browsing. Doing that means collecting a person's private communications, and
> it is out of scope here on purpose. Everything else below is the real, working app.

## 1. What it is

Haven is a family-safety app for **one parent and one (or more) children**. It is **one app with
two roles**, not two apps. On first launch the person chooses "I'm a parent" or "This is my
child's device"; once a device joins a family, the server fixes its role and the app shows only
that side.

- **Parent:** email + password account (verified), creates the family, approves devices, sets
  limits/rules, answers requests, sees check-ins and SOS, chats.
- **Child device:** no email. Signs in anonymously when it enters a one-time pairing code, and is
  in the family only once a parent approves the four-character check.

Until a device joins a family it runs in **sample mode** (local demo data, nothing synced). The
store flag `live` (`src/state/store.tsx`) is the switch: `live === true` means "in a real family".
Many screens read it to show the truth instead of sample data.

## 2. Tools (stack)

| Layer | What | Where |
|---|---|---|
| App framework | **Expo SDK 58**, React Native 0.88, React 19 (React Compiler on) | `package.json`, `app.json` |
| Language | **TypeScript** | `tsconfig.json` (`npx tsc --noEmit` to check) |
| Navigation | **Expo Router** (file-based; every file in `src/app/` is a route) | `src/app/**`, `_layout.tsx` files |
| Backend SDK | **Firebase JS SDK** (Auth + Cloud Firestore), Spark/free plan | `src/sync/**` |
| Build / OTA | **EAS Build** and **EAS Update** (`expo-updates`) | `eas.json`, `app.config.js` |
| Local storage | AsyncStorage | `src/state/storage.ts` |

Run it: `npm install` then `npx expo start` (press `w` for web). Native builds: `npm run apk`
(local Android) or EAS — see `docs/RELEASE.md`. Anything touching a native module needs a
**development build**, not Expo Go.

## 3. Platforms

- **One app id:** `com.haven.familysafety`. Same binary serves both roles.
- **Parent:** Android **and** iOS.
- **Child:** **Android only** in practice. iOS blocks the device-management a child side would
  need (Apple's Family Controls / Screen Time API require a special entitlement), so real
  enforcement on a child iPhone is not available without that. The app itself does not hard-lock
  the role to a platform; "child = Android" is a deployment decision you enforce by only
  installing/using the child role on Android.
- **Main child device:** Vivo V40e, Funtouch OS 6+, Android 16/17. Two real-world notes for that
  device: (1) **Android 17 Local Network Protection** — an app targeting API 37 needs
  `ACCESS_LOCAL_NETWORK` to reach a dev machine on the LAN (handled for emulator test builds in
  `plugins/withLocalEmulatorNetwork.js`); (2) **Funtouch OS kills background processes
  aggressively** — anything meant to run in the background (sync while closed, background
  location) must be whitelisted in Funtouch battery settings or it will be stopped. Haven today
  only syncs while open, so this does not bite yet, but it will for anything backgrounded.

## 4. The backend

Firebase project **`vivo-v40e-3ab5f`**. No server of our own, no Cloud Functions, no admin key.
The two phones talk to Cloud Firestore directly; access is decided entirely by the security rules.

- **Client config:** `firebase.config.json` (public web config, read in `app.config.js` →
  `extra.firebase` → `src/sync/config.ts`). These are not secrets.
- **Security rules:** `firestore.rules` — the authority on who may read/write what. Tested request
  by request in `tests/rules/**` (3,017 checks). **Do not weaken these.** The emergency "shut
  everything" file is `firestore.lockdown.rules`.
- **Data layout and sync explained:** `docs/BACKEND.md`. Guarantees and limits: `docs/SECURITY.md`.
  Console + first-run steps: `docs/SETUP.md`.

Firestore collections (per family): `families/{fid}` → `members`, `devices`, `children` (→
`live/status`, `requests`, `messages`), `alerts`, `places`, `schedules`, `sites`, `tasks`,
`signals/sos`; plus top-level `users/{uid}` (pointer) and `pairing/{CODE}`.

## 5. Repo map

```
src/
  app/            every file = a screen (Expo Router). (parent)/ and (child)/ are the two tab sets.
    _layout.tsx   route guards: closes the parent side to a child device and vice versa (role lock)
    index.tsx     first run + role chooser
    account.tsx   parent sign in / create account / confirm email / create family
    pairing.tsx   parent: make a code, check + approve a device, remove a member
    link-device.tsx  child/second-parent: enter a code, wait for approval
  sync/           the backend layer (no UI)
    auth.ts       Firebase Auth (parent email accounts, child anonymous accounts)
    remote.ts     Cloud Firestore: every read/write the app makes
    schema.ts     the per-item document shapes + which fields each role may touch (mirrors rules)
    reconcile.ts  pure three-way merge (local / server / base); offline + conflict handling
    engine.ts     one linked session on top of reconcile (listeners, pending writes)
    controller.ts who is signed in, pairing state machine, status; the LinkState the screens see
    link.tsx      React provider: useLink()
    types.ts      LinkState contract, pairing helpers
  state/
    store.tsx     all local data + every action the screens call; the `live` flag; persistence
    persist.ts    serialise/restore the saved slices
  platform/
    capabilities.ts  per-platform description of what device features exist / are possible
  components/     shared UI kit
firestore.rules, firebase.config.json, app.json, app.config.js, eas.json
tests/            rules/ (security), sync/ (engine + 2-phone scenarios), ui/ (2-browser e2e)
docs/             SETUP, RELEASE, BACKEND, SECURITY, this file
```

## 6. Feature → start/end points (the real, working features)

Pattern for every synced feature: a **screen** calls a **store action** (`src/state/store.tsx`),
which updates local state; the **sync engine** (`src/sync/*`) sends the changed item to Firestore
under the rules, and the other phone's listener applies it. So "start" = the screen + store
action, "end" = the Firestore write in `remote.ts`/`schema.ts` and the rule that allows it.

| Feature | Screen(s) | Store action | Server (remote.ts / collection) |
|---|---|---|---|
| Role choice + lock | `index.tsx`, `_layout.tsx` | `setRole` | — (local) |
| Onboarding | `onboarding.tsx` | `completeOnboarding` | — |
| Parent account | `account.tsx` | — | `auth.ts` (signUp/signIn/verify) |
| Create family | `account.tsx` | `createFamily` (LinkState) | `createFamilyBatch` + `seedFamilyBatch` |
| Pairing (parent) | `pairing.tsx` | `createPairingCode`, `approveClaim`, `removeMember` | `pairing/{CODE}`, `members`, `devices` |
| Pairing (join) | `link-device.tsx` | `joinWithCode` | `pairing/{CODE}` claim |
| Requests (ask) | `(child)/requests.tsx`, `unlock-request.tsx` | `requestExtraTime`, `requestUnlock` | `children/{cid}/requests` |
| Requests (answer) | `(parent)/dashboard.tsx` | `resolveRequest` | update request + child |
| Check-in | `(child)/home.tsx` | `checkIn` | `children/{cid}/live/status` + `alerts` |
| SOS | `sos.tsx` | `triggerSOS`, `clearSOS` | `signals/sos` + `alerts` |
| Chat | `messages.tsx` | `sendMessage` | `children/{cid}/messages` |
| Tasks / rewards | `rewards-parent.tsx`, `(child)/rewards.tsx` | `toggleTask`, `grantBonus` | `tasks` |
| Daily limit / pause | `screen-time.tsx`, `child-profile.tsx`, dashboard | `adjustLimit`, `grantBonus`, `pauseDevice`, `resumeDevice` | update `children/{cid}` |
| App limits / block | `app-limits.tsx` | `toggleApp`, `setAppLimit` | update `children/{cid}.apps` |
| Places | `geofences.tsx`, `add-place.tsx` | `addPlace`, `removePlace`, `togglePlaceAlert` | `places` |
| Schedules | `schedules.tsx`, `add-schedule.tsx` | `addSchedule`, `toggleSchedule`, `removeSchedule` | `schedules` |
| Site lists | `web-filter.tsx`, `site-list.tsx` | `addSite`, `removeSite` | `sites` |
| Activity feed | `notifications.tsx` | `markAlertsRead` | `alerts` |
| "What's shared" / capabilities | `transparency.tsx`, `about-version.tsx` | — | `src/platform/capabilities.ts` |

Key invariant to preserve: in a **linked family** the UI must not claim something the app does not
actually do. Screens check `live` and the capability seam for this. Keep that honesty if you
extend them.

## 7. The device-capability seam (where real enforcement/location would attach)

`src/platform/capabilities.ts` is the single place that describes, per platform, what each device
feature is and whether this build does it. Today every device feature returns
`implemented: false` — the app shows and syncs **agreements and limits**, it does not read a
phone's location, measure app usage, or lock anything.

If you implement any of these, do it behind that seam (set `implemented: true` for the platform,
add the native module via a config plugin, rebuild — a native change needs a new build, not an OTA
update) and keep the "What's shared" / "What this version does" screens truthful.

## 8. Unfinished features — where to start

Each row names the current state and the **one place to start**. Most are gated behind the
capability seam above; implementing one means flipping its flag in `src/platform/capabilities.ts`,
adding a native module via a config plugin, and making a **new build** (a native change does not
ship as an OTA update). Keep the "What's shared" and "What this version does" screens
(`transparency.tsx`, `about-version.tsx`) accurate as you go.

| Feature | Current state | Start here | Nature of the work |
|---|---|---|---|
| **Finish schedules + site lists on the child side** | Saved and synced already (`schedules`, `sites` collections), just not shown on the child's phone | `src/app/(child)/` — add a screen that reads the already-synced `schedules`/`sites` from `useStore()` | **Pure UI, no native module, fully in scope.** The easiest first task. |
| **Real location sharing** | Not read; a check-in sends a time only | `src/platform/capabilities.ts` (the `location` entry), then the check-in path: `store.tsx` → `checkIn` → `children/{cid}/live/status` in `remote.ts`/`schema.ts` (a real position rides along the same write) | Native location module (`expo-location`), permission granted on the device. The OS shows a location indicator — visible by design; keep the child's transparency entry truthful. |
| **Real screen-time / app-usage measurement** | `usedMin` values are examples | `src/platform/capabilities.ts` (`usage`); a native module reading Android `UsageStatsManager`, feeding the child document's usage fields | "Usage access" granted in Android settings. This is time-in-app duration, not content. |
| **Enforcing limits / blocking apps** | Limits and blocks are data only (`toggleApp`, `setAppLimit`, `pauseDevice` → `children.apps` / `bedtime`) | `src/platform/capabilities.ts` (`blocking`); a native enforcement module driven by the already-synced child document | Supported route is a **supervised / managed device** (Android device-owner / profile-owner). A visible, consented setup — not background accessibility scraping (that is the stalkerware pattern). |
| **Push to a closed app** | Alerts/SOS/requests reach the other phone only while Haven is open | `src/platform/capabilities.ts` (`notifications`); the alert/SOS/request writes in `remote.ts` are the trigger points | FCM + a config plugin, device push tokens, and a sender. Note: the Spark plan has no Cloud Functions, so the send needs a small server or a third-party trigger. |
| **Background sync on Funtouch OS** | Syncs only while open | Whichever feature above needs the background; an Android foreground service | Funtouch OS kills background work — the device must whitelist Haven in its battery settings. |

### Not covered here (preview-only, no starting point provided)

The six monitoring screens — **Calls, Messages, Social content, Browsing History, Video History,
Keyword Alerts** — live in `src/app/feature/[key].tsx` and are intentionally inert previews. This
guide deliberately gives **no starting point** for turning them into real reading of a person's
calls, messages, or browsing: that is collecting someone's private communications, which is why
they are previews in the first place. Everything else above is a normal feature with an honest
path.

## 9. Working alongside the existing team in this repo

- Work on your **own branch** (e.g. branch off `main`), separate from `v2-secure-sync`. Git merges
  non-overlapping changes cleanly; a separate branch avoids stepping on in-progress work.
- Add new modules in new files/folders rather than rewriting `src/sync/**` or `firestore.rules`;
  those are covered by the test suites (`npm run test:rules`, `test:sync`, `test:live`) — run them
  after changes so the security rules and sync guarantees stay intact.
- `npx tsc --noEmit` must stay clean.
