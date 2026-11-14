# Building, installing and updating Haven

Haven is one Expo app for Android and iOS. This page covers how to get it onto the two phones
(a Vivo V40e and an iPhone), and how to update it afterwards.

There are two kinds of change:

| Change | How it reaches the phones |
|---|---|
| JavaScript, screens, wording, images | **EAS Update**: published over the air, picked up the next time the app starts |
| Anything native: a new native module, permissions, the app icon, the Expo SDK, `app.json` | **A new build**, installed over the old one |

The app decides which is which by itself: each build carries a fingerprint of everything native
(`runtimeVersion` in `app.config.js`), and an update is only offered to builds with the same
fingerprint. An update that needs native changes simply does not reach an older build.

## What you need

- An **Expo account** (free): <https://expo.dev/signup>.
- For the iPhone: an **Apple Developer Program** membership (paid, yearly). Apple does not allow
  installing an app on an iPhone outside the App Store without it. The only free route is building
  from a Mac with Xcode and a personal Apple ID, and that app stops opening after 7 days.
- Node.js 20 or newer on your computer, and this repository.

Nothing here needs a Mac, Android Studio or Xcode: EAS builds in the cloud.

## One-time setup

```bash
npm install
npx eas-cli@latest login
npx eas-cli@latest init          # creates the project on your Expo account
```

`eas init` writes `extra.eas.projectId` into `app.json`. Commit that change. From then on
`app.config.js` switches EAS Update on for every build (it stays off without a project id).

## Android (the Vivo V40e)

```bash
npx eas-cli@latest build --platform android --profile preview
```

The `preview` profile produces an APK. When the build finishes, EAS shows a link and a QR code:
open it on the phone, download, and allow installing from that source. EAS creates and keeps the
signing key, so every later build installs over the earlier one.

An APK built on your own machine (`npm run apk`, see the README) works too, but it is signed with
a different key: Android will not install it over an EAS build or the other way round. Pick one
route per phone and stay with it. A locally built APK also has no update channel, so it does not
receive over-the-air updates.

Older test builds named "Haven" or "Haven Kids" used other package names. Uninstall them: they
cannot be upgraded to this app and do not talk to it.

## iPhone

1. Register the iPhone with your Apple team (once per device):

   ```bash
   npx eas-cli@latest device:create
   ```

   Open the link it prints on the iPhone and install the profile it offers. New Apple Developer
   memberships can take a day or two before devices can be registered.

2. Build:

   ```bash
   npx eas-cli@latest build --platform ios --profile preview
   ```

   The first build asks you to sign in with your Apple ID so EAS can create the certificate and
   the provisioning profile. It has to be run by you, in a terminal, for that reason.

3. Open the link from the finished build on the iPhone and install. If iOS asks, switch on
   Developer Mode (Settings, Privacy & Security) and restart.

If you register another device later, build again with
`--refresh-ad-hoc-provisioning-profile` once so the new device is included.

This repository's iOS app has not been built or run yet: it is the same code that runs on Android
and in the browser, with no iOS-specific native code, but the first build is the first proof.
Report anything odd from that first run.

## Updating the app over the air

After changing JavaScript or assets:

```bash
npx tsc --noEmit
npx eas-cli@latest update --channel preview --environment preview --message "What changed"
```

Both phones pick it up the next time the app is opened with a connection (it downloads on one
start and runs on the next). Builds made with the `production` profile listen on the `production`
channel instead.

If the change touched something native, `eas update` still publishes, but the fingerprint differs
and the installed builds ignore it. Make a new build for both platforms then.

## Before the first real use

1. Publish the security rules and switch on the two sign-in methods: [SECURITY.md](SECURITY.md),
   "Publishing the rules".
2. Install the app on both phones.
3. On the parent's phone: "I'm a parent", create the account, confirm the email, create the family.
4. On the child's phone: "This is my child's device", enter the code from "Devices & Pairing",
   compare the four characters on both phones, approve on the parent's phone.

## Checks before publishing an update or a build

```bash
npx tsc --noEmit        # types
npm run test:sync       # sync logic, about 4 minutes
npm run test:rules      # security rules, needs the Firestore emulator
npm run test:live       # two-phone scenarios, needs the Firestore and Auth emulators
```

Starting the emulators: `npx firebase-tools emulators:start --only firestore,auth --project demo-haven`
(needs Java). The tests never touch the real Firebase project.
