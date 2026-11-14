# Live scenarios: real phones' code against the emulators

These tests run the app's real link layer end to end: several "phones" at once, each one the
unmodified `StoreProvider` and `LinkProvider` from `src/` under React, talking to the Cloud
Firestore emulator (with `firestore.rules` loaded) and the Firebase Auth emulator. They check what
the server holds, what each phone shows, and how many documents each phone wrote.

They complement the two other suites: `tests/rules` (the security rules on their own) and
`tests/sync/*.test.mjs` (the reconcile core on its own, with a model of the server).

## Running

Both emulators must be up: Firestore on `127.0.0.1:8085`, Auth on `127.0.0.1:9099` (the ports in
`firebase.json`; for example `npx firebase-tools emulators:start --only firestore,auth --project demo-haven`).

```bash
# everything, about 6 minutes
node --test --test-concurrency=1 --test-timeout=400000 tests/sync/live/*.test.mjs

# one group
node --test --test-timeout=400000 tests/sync/live/d-regressions.test.mjs

# one test of a group
node --test --test-timeout=400000 --test-name-pattern="second tap" tests/sync/live/d-regressions.test.mjs
```

Suggested `package.json` script:
`"test:live": "node --test --test-concurrency=1 --test-timeout=400000 tests/sync/live/*.test.mjs"`

- **One file at a time** (`--test-concurrency=1`). Every file uses the project id `demo-haven`
  and, in its `before`, loads `firestore.rules` into the emulator and **deletes every document and
  every account of that project**. Do not run two files at once, and do not run them while
  something else uses `demo-haven` on these emulators.
- Nothing here can reach a real Firebase project: the phones are configured with the emulator
  addresses only, and the driver talks to `127.0.0.1`.

Environment variables:

| Variable | Meaning |
|---|---|
| `HAVEN_LIVE_FAST=1` | skip the one test that waits 65 seconds (the "last seen" interval, in `h`) |
| `PHONE_VERBOSE=1` | print what each phone's `console.error` / `console.warn` receives as it happens |
| `HAVEN_LIVE_DIR` | where the phones' storage files and the compile cache go (default: `<os tmp>/haven-live`) |
| `HAVEN_FIRESTORE_EMULATOR`, `HAVEN_AUTH_EMULATOR` | `host:port` of the emulators, if not the defaults |

## The groups

| File | What it covers |
|---|---|
| `a-setup.test.mjs` | sign-up, email confirmation, creating the family; a second device of the same account; accounts that may not create a family |
| `b-pairing.test.mjs` | pairing codes: join, the 4-character check, approve into an existing or a new child, a second parent; wrong, expired, declined and used codes |
| `c-everyday.test.mjs` | chat, requests and answers, check-in, SOS, tasks, every rule a parent can change |
| `d-regressions.test.mjs` | the defects of the first engine: cold start after an approval, offline check-in, kill right after joining, kill between saves, taps during a send, two children |
| `e-tamper.test.mjs` | a child phone whose store, saved state or link record was tampered with |
| `f-leaving.test.mjs` | removal by a parent, a child unlinking itself, a parent signing out |
| `g-offline.test.mjs` | starting without a network, changes made offline, with and without a kill |
| `h-writes.test.mjs` | idle phones write nothing; what each action costs in document writes; "last seen" |

## What is real and what is not

Real: every file under `src/` that the two providers import (store, persistence, controller,
engine, reconcile, schema, remote, auth), React 19 (`react-dom` on a container that draws nothing),
the Firebase JS SDK, both emulators, the rules.

Replaced (see the top of `harness/phone.cjs`):

- `react-native`: `Platform`, `AppState`, `Vibration`, `View`, `useColorScheme` as plain objects.
- `expo-constants`, `expo-device`: the Firebase config of a test build, a device name.
- AsyncStorage: one JSON file per phone, written synchronously on every `setItem`. Killing a phone
  is `SIGKILL` of its process: timers and unsaved state are lost, the file stays. That is how
  "the app was killed" and "the app was started again" are done.
- `firebase/firestore`: the real module, wrapped so that every call the app makes is recorded.

Not the same as a phone, and therefore **not proven here**:

- Nothing runs on Android or iOS, or under Hermes. It is node (V8).
- Firestore is the SDK's Node build (gRPC). On a phone Metro bundles the React Native build, which
  talks WebChannel with long polling (`experimentalForceLongPolling`). Firebase Auth *is* the React
  Native build, with the same AsyncStorage persistence as on a phone (`authInstance.native.ts` runs).
- The TypeScript is compiled with `typescript` (types removed, JSX turned into calls). The React
  Compiler that the app build applies is not.
- No screens: the tests call the store's actions and `LinkState`'s actions directly.
- Timers that take minutes in reality (pairing expiry on the phone's own clock, the Auth SDK's
  60 second timeout) are not waited for; expiry is arranged on the server instead.

## The harness

`harness/driver.mjs` (used by the tests):

- `resetBackend()`: rules loaded, no documents, no accounts.
- `makePhone(name, { platform, deviceName })` returns a phone:
  - `launch()` cold start (process + providers mounted), `kill()`, `relaunch()`, `exited()`;
  - `view()` returns `{ link: {status, account, familyId, role, childId, members, offer, pendingJoin, error, ...}, store: {children, requests, messages, alerts, places, schedules, sites, tasks, sosActive, live, selfId, ...} }`;
  - `store(method, ...args)` calls a store action as a tap would; `storeMany([[method, ...args], ...])` several in one tick;
  - `link(method, ...args)` calls a `LinkState` action and returns `{ ok, value }` or `{ ok: false, code, message }`;
  - `waitStatus(status)`, `waitFor(fn)` (inside the phone), `eventually(fn, label)` (polled from the test);
  - `fx(reset)` the Firestore calls the app made: `{ kind: 'write'|'read'|'listen', op, path, keys, state }`;
  - `offline('refuse' | 'hang', 'both' | 'auth' | 'firestore')`, `online()`, `latency(ms)`: the phone's own network (a TCP relay per phone and emulator);
  - `killOn({ on: 'view' | 'storage' | 'write' | 'now', ... })`: die at an exact moment;
  - `disk()` / `setDisk()`: the storage file, for looking and for tampering while the app is stopped;
  - `errors()`: what the app printed.
- `server.doc / collection / family / dataText / patch`: what the emulator holds, read past the
  rules (admin access). `readAs(idToken, path)`: a read through the rules as that account.
- `authEmulator.confirmEmail(email)`, `authEmulator.accounts()`.
- `createFamily(parent)`, `enrol(parent, joiner, target, role)`, `signUpVerified(phone, email)`,
  `quiet(phones)` (wait until nobody has a write in flight), `writesIn(log)`, `describeWrites(log)`.

`harness/expect.mjs`: `syncedOf(store)` (a store view without display labels, for comparing two
phones), `sameData`, `differences`, `showsSample`, `noAppErrors(phones, allowedPatterns)`.

A minimal scenario:

```js
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createFamily, disposeAll, enrol, makePhone, quiet, resetBackend, server } from './harness/driver.mjs';

let parent, child, fam;
before(async () => {
  await resetBackend();
  parent = makePhone('x-parent', { platform: 'ios' });
  child = makePhone('x-child');
  await parent.launch();
  await child.launch();
  fam = await createFamily(parent);
  await enrol(parent, child, { childId: fam.childId });
});
after(disposeAll);

test('the child ticks a task', async () => {
  await child.store('toggleTask', 't2');
  await parent.eventually((v) => v.store.tasks.find((t) => t.id === 't2').done, 'the parent to see it');
  assert.equal((await server.doc(`families/${fam.familyId}/tasks/t2`)).done, true);
});
```

## Things the emulators do that a real project does not

- After a phone was killed, the Firestore emulator can answer a write with
  `UNKNOWN: Application error processing RPC` although it applied it: the write made the emulator
  tell a listener of the dead phone "you may no longer read this" (a deleted pairing code, for
  example), and it trips over the closed stream. The SDK then sends the write again; for a delete
  that second try is refused, because the document is gone. `d-regressions` allows exactly these
  two messages for the phones it kills while they join. The same defect makes "delete all
  documents" answer HTTP 499 now and then; `resetBackend()` asks again.
- The SDK prints a warning for every refused write and listener, and when it loses the connection.
  Tests that provoke those pass `REFUSAL_NOISE` / `OFFLINE_NOISE` to `noAppErrors`; everywhere else
  any printed error or warning fails the test.
