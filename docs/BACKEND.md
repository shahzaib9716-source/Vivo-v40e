# The backend

Haven uses one Firebase project on the free **Spark** plan: Firebase Authentication and Cloud
Firestore. There are no Cloud Functions, no server of our own and no administrative key anywhere:
the two apps talk to Firestore directly, and `firestore.rules` decides what each may do.

## Console setup (once)

1. **Authentication, Sign-in method:** enable **Email/Password** and **Anonymous**.
2. **Firestore Database, Rules:** publish `firestore.rules` after putting the parent's email
   address into `ownerEmails()`. Details and the reasons: [SECURITY.md](SECURITY.md).
3. Optional: under Authentication, Templates, set the sender name of the confirmation and
   password emails.

No composite indexes are needed: every query the app makes uses one field.

`firebase.config.json` in the repository root holds the project's web client settings. They are
public by design (every Firebase app ships them) and grant nothing by themselves.

## Who is who

| | Signs in with | Becomes a member when |
|---|---|---|
| Parent | email and password, confirmed address | they create the family (owner list), or another parent approves their code |
| Child's phone | an anonymous account made when it enters a code | a parent approves the claim and picks the child |

## Data layout

```
users/{uid}                         which family and role this account has
pairing/{CODE}                      a one-time code: who made it, who claimed it, approved or not
families/{familyId}                 name, owner
  members/{uid}                     role (parent | child), childId, device name, platform
  devices/{deviceId}                "last seen"
  children/{childId}                name, age, limits, app rules, pause
    live/status                     the child's last check-in time
    requests/{id}                   more time, unlock an app; pending, approved or denied
    messages/{id}                   the chat with this child
  alerts/{id}                       the parent's activity feed
  places|schedules|sites|tasks/{id} rules and tasks
  signals/sos                       whether an SOS is on, and whose
```

Each item is its own document so that the rules can decide per item and per field: a child may
tick a task but not change its points, may create a request but not answer it.

## How syncing works

- Each phone keeps a full local copy and works from it, so the app is usable offline.
- When something changes locally, only the changed documents and fields are sent.
- For every item the phone remembers what the server last confirmed. A difference from that is a
  local change to send; anything else arriving from the server is taken as it is. Two phones
  changing different fields of the same item both win; the same field, the later write wins.
- Nothing is sent before the server's data has been read at least once in a session, and a phone
  that has just joined, or signed in, only takes data: it never uploads its sample data.
- A write the server refuses is put back locally and not retried.
- An idle phone writes nothing, apart from a "last seen" mark at most once a minute while the
  app is in the foreground. Typical use stays far inside the Spark plan's daily quota.

## What it costs

On the Spark plan: nothing. The limits that matter are 50,000 document reads and 20,000 writes a
day and 1 GiB stored. Two phones in ordinary use stay far below them: each change is one or two
small writes, and an idle phone writes nothing (measured in `tests/sync/live/h-writes.test.mjs`).

## What the backend does not do

There is no push service: a phone learns of a change while the app is open. See the README for
the full list of what this version leaves out.
