# Haven

A family-safety app with two sides in one build: a parent app and a child app. Built with React Native and Expo (SDK 58, Expo Router, TypeScript). The repository is named `Vivo-v40e`; the app is called Haven.

Haven is transparent by design: the child can always open a screen that lists exactly what is shared with the family and what is not.

## Run it

```bash
npm install
npx expo start
```

Scan the QR code with the **Expo Go** app, or press `w` to open it in the browser. If Metro runs out of memory on a long session, start it with `NODE_OPTIONS=--max-old-space-size=8192`.

## What is in it

**First run:** a four-slide introduction, then a chooser for the parent or the child side. The introduction is remembered; Settings has "Replay introduction".

**Parent:** dashboard with a screen-time ring per child, approve or decline requests, pause a device, add time; screen-time limits; per-app limits and blocking; web and content filter with editable blocked and allowed site lists; schedules and bedtime (add, toggle, remove); routines; location with places and geofences (add, remove, arrival and departure alerts); location history; reports by day, week and month; rewards and tasks; family chat; notifications; settings; subscription; device pairing.

**Child:** time left and allowed apps; ask for more time; ask to unlock an app; check in; rewards; family chat; "What's shared"; press-and-hold SOS that alerts the parent side.

**Preview only:** calls, messages, social apps, browsing history, video history and keyword alerts are labelled preview screens with made-up sample rows. Nothing reads real data from a device.

All data is demo state held in memory, so it resets when the app restarts. There is no backend.

## Checks

```bash
npx tsc --noEmit   # typecheck
```

## Structure

- `src/app/` — screens (every file is a route). `(parent)/` and `(child)/` are the two tab apps; the other files are screens pushed on top.
- `src/app/feature/[key].tsx` — the preview screens and the approval settings.
- `src/components/ui/` — the shared UI kit (Text, Card, Button, Row, Toggle, ProgressRing and so on).
- `src/state/store.tsx` — demo data and every action the screens call.
- `src/theme/index.ts` — colours for light and dark, spacing, radius, type scale.
- `assets/images/` — app icon, Android adaptive icon, splash art, favicon.
