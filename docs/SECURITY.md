# Security

How Haven protects a family's data, what the Firestore rules guarantee, how to publish them, and
what they cannot do. The rules are in [`firestore.rules`](../firestore.rules); their tests are in
[`tests/rules`](../tests/rules).

## Summary

- Nothing in the database can be read or written without signing in.
- A family's data is visible only to accounts that a parent of that family has enrolled.
- Each enrolled account is a **parent** or a **child**. The role is stored on the server, set by a
  parent at enrolment, and cannot be changed afterwards, by anyone.
- A device joins with a **one-time pairing code**. The code expires 15 minutes after the server
  stored it, can be claimed once, and does nothing until a parent approves the claim.
- A child's phone can only do what a child needs: ask for time, check in, raise or clear its own
  SOS, chat as itself, tick tasks. It cannot change limits, rules, membership or anyone else's
  records, even with a modified app, because the server refuses the request.
- Everything runs on the free Spark plan: no Cloud Functions, no server keys. No administrative
  credential exists in the app, the repository or the build.

## What changed from the first version

The first link had no sign-in. A family id was a long random string and knowing it was the key to
the family's data. That was reviewed and rejected. Each finding and what replaced it:

| Finding | Now |
|---|---|
| Anyone who knows a family id can read the family | Reads require a member record for the signed-in account in that family. Family documents cannot be listed. |
| Family documents can be changed without authentication | Every write requires sign-in, a member record, and the right role for that document and those fields. |
| No authentication, no roles | Firebase Authentication. Parents: email and password, with a verified address. Child devices: an anonymous account that only becomes useful once a parent enrols it. Roles live in `families/{id}/members/{uid}`. |
| Pairing codes readable and deletable by anyone | A code can be read only by the family's parents and by the device that claimed it. It cannot be listed. Only those same parties can delete it. |
| Anyone can create a family | Only a verified account whose address is on the owner list in the rules can create a family, and only one. |
| Rules validate field names and sizes only | The data is no longer one document of JSON strings. Each item is its own document, and the rules check who may create it, which fields each role may change, types, sizes, the author's uid and server timestamps. |

## Identities

| Who | How they sign in | What it proves |
|---|---|---|
| Parent | Email and password. The address must be verified through the link Firebase sends. | Control of that mailbox. A parent can sign in on any phone, Android or iOS, and finds the same family. |
| Child device | Anonymous Firebase account, created when the child's phone enters a pairing code. | Nothing by itself. It gains access only when a parent approves it, and only as the child profile the parent picks. It is tied to the app installation: reinstalling means pairing again. |

Anyone can create an anonymous account in any Firebase project; that is how Firebase works. Here
such an account can do exactly one thing: try to claim a pairing code.

## Who can do what

| Data | Parent | Child device (enrolled as one child) |
|---|---|---|
| The family record | read, rename | read |
| Members | read, enrol through an approved code, relabel, remove (never the founder) | read, remove itself |
| A child's profile, limits, app rules, pause | read, create, change | read its own only |
| Requests | read, answer once, delete | read its own, create a pending one for itself |
| Chat | read, send as parent | read its own thread, send as itself |
| Activity feed | read, add, mark read, delete | add entries about itself, cannot read |
| Places, schedules, site lists | read, create, change, delete | read |
| Tasks | read, create, change, delete | read, tick or untick |
| SOS | read, mark safe | read, raise its own, clear its own |
| Check-in time | read | write its own |
| Pairing codes | create for the own family, read, approve, delete | claim by code, read and withdraw its own claim |

Chat messages cannot be edited or deleted by anyone. A request can be answered only while it is
pending, and only by a parent. A child cannot read a sibling's profile, requests or chat.

One deliberate exception to "every write needs a member record": a device that has just been
removed may still delete its own "last seen" record, so it can tidy up after itself. It cannot
write one, and cannot touch anyone else's.

## Pairing

1. A parent creates a code: 8 characters from a 31-character alphabet, about 850 billion
   combinations. It stops working 15 minutes after the server stored it.
2. The joining device claims it. The claim records that device's account, name and platform. A
   wrong guess and an expired code give the same refusal, so guessing learns nothing. A code can
   be claimed once.
3. Both phones show a 4-character check. The parent types the characters shown on the joining
   phone; Approve only switches on when they match. Then the parent approves or declines.
4. Approval creates the member record and marks the code used **in one step**: the rules accept
   neither without the other, and the member record must match the claim (account, role, name).
   A used code cannot enrol anyone again.

What this prevents:

- **Guessing a code.** One guess has a 1 in 850 billion chance per active code, codes last 15
  minutes, and a correct guess still only produces a request on the parent's phone, with the wrong
  check characters.
- **Reusing a code**, or enrolling a second device with it. Refused by the rules.
- **Enrolling without a parent.** Only a parent can create a member record, and only for the
  account that claimed one of that family's own codes.
- **A removed device coming back.** It needs a new code and a new approval.

The step that depends on a person: **type the 4 characters from the phone in your hand.** If
someone else saw the code on the parent's screen and claimed it first, the child's own phone will
show "code not valid", and the characters on it will not match the request on the parent's phone,
so Approve stays off. The server cannot check that a person compared them; the app makes it a step
that cannot be skipped by tapping.

## Publishing the rules

1. In `firestore.rules`, put the parent's email address in `ownerEmails()`, lower case:

   ```
   function ownerEmails() { return ['you@example.com']; }
   ```

   Only these addresses can create a family. Leave the placeholder and nobody can.
2. Firebase console, Firestore Database, Rules: replace everything with the file's contents and
   press Publish.
3. Firebase console, Authentication, Sign-in method: enable **Email/Password** and **Anonymous**.

Until those three steps are done, keep the database shut with
[`firestore.lockdown.rules`](../firestore.lockdown.rules) (nobody can read or write anything).
Publishing those same rules is also the emergency stop: it takes effect within about a minute and
deletes nothing.

Optional, after both phones are set up:

- Authentication, Settings, User actions: switching off sign-up stops new accounts being created
  in the project at all. Switch it back on before pairing a new phone, because a child device
  creates its anonymous account at that moment. (Check that the option is offered on your plan.)
- Google Cloud console, APIs and Services, Credentials: the browser key Firebase created can be
  restricted to the Identity Toolkit, Token Service and Cloud Firestore APIs ("API
  restrictions"). Leave "Application restrictions" at None: Haven uses Firebase's JavaScript SDK on
  both phones, which does not identify itself as an Android or iOS app, so an Android or iOS
  application restriction would lock the app out.

## The app and the server

One app holds both the parent side and the child side. Once a phone is in a family, the app only
opens the side that matches the role the server gave its account, and offers no way to switch.
That is for the person using it. What protects the data is the server: a child's account is
refused there whatever a modified app sends, and the tests below send exactly such requests.

## Tests

`npm run test:rules` runs the rules in the Firestore emulator: 3,017 checks, none of which
contact a real project. They cover

- every legitimate operation of each role, issued the way the app issues it;
- every operation attempted with no sign-in, by an anonymous stranger, by verified and unverified
  strangers, and by an unverified account that registered the owner's address;
- a parent and a child of another family against every document of this one;
- a child device trying to gain parent powers: its role, limits, its own requests, other
  children's data, the feed, membership, pairing;
- pairing abuse: guessing, expired and used codes, approving without enrolling and the reverse,
  reuse, wrong role or device, self-approval;
- integrity: forged authors, client-made timestamps, extra or missing fields, wrong types and
  sizes, fields that must never change;
- the number of document lookups the rules make, against Firestore's limits;
- the red team's attacks (above).

`npm run test:sync` tests the app's sync logic, including 5,000 random histories with restarts,
offline periods and killed apps, against a model of these same permissions.

`npm run test:live` runs the real code of two or three phones against the Firestore and Auth
emulators with these rules loaded: 66 scenarios, among them a child's phone whose saved data,
sync records or role were tampered with (nothing it sends is accepted, and it ends up showing the
real data again), a removed phone (its old sign-in is refused on every family path), and phones
killed at awkward moments.

`tests/ui/two-browsers.e2e.js` drives the screens themselves in two browsers: account, email
confirmation, family, code, the matching four characters, approval, and that each phone only
opens its own side.

## Red team

After the rules were written and tested, they were attacked by someone who had not written them,
with a modified client sending anything the SDK or the REST API allows (batches, transactions,
field masks, transforms, queries, collection-group queries, odd tokens and ids), from ten
positions: no account, a fresh anonymous account, an unverified account (also one registered with
the owner's address), a verified non-owner, an enrolled child, a removed child, a phone whose claim
is waiting, a parent and a child of another family, a second parent against the founder.

1,916 attack requests are in `tests/rules/08-red-team.test.mjs`. Two got through and were fixed:

| Finding | Who could use it | Fixed by |
|---|---|---|
| A token with a verified email from any sign-in method other than "anonymous" (a custom token, or a provider switched on later) counted as a confirmed parent account | Nobody with this project's console settings; it would have opened if another sign-in provider were enabled | Parent rights now require email-and-password sign-in specifically |
| An owner who was also enrolled in a second family could park its account pointer there, leave, and found more families | Only an owner-listed account, only with two families in the project | The pointer can only move once the account has left the family it names |

Everything else was refused. Each of the two fixes was checked against the old rules (the attack
succeeds) and the new ones (refused), and eight deliberately weakened copies of the rules were each
caught by the suite.

## What the rules cannot do

- **Rate limiting.** Firestore rules cannot count attempts. Someone with the project's public
  client settings can send refused requests until the free plan's daily quota is used up, and an
  enrolled phone could do the same with permitted writes. Nothing leaks, but until the quota resets
  (midnight, Pacific time) the phones stop syncing, **SOS included**: do not rely on Haven as the only
  way to call for help. Defences: restrict the API key (below), switch off sign-up while nobody is
  pairing, remove a phone that misbehaves, and Firebase App Check, which needs native attestation
  and is not part of this version.
- **Cutting off an open connection instantly.** When a parent removes a device, its next request
  is refused. A listener that a modified app already had open can keep receiving updates until
  its access is next re-checked, which can take up to about an hour. The Haven app itself stops
  and erases its copy as soon as it sees it was removed.
- **What a parent does.** A parent account can do everything inside its own family, including
  enrolling another parent, who can then do the same, except remove or replace the person who
  created the family. Protect the account with a strong password.
- **One SOS at a time per family.** The SOS flag is one document for the family. With two
  children, one child's phone can replace the other's active SOS with its own and then clear it.
  Both SOS entries stay in the parent's activity feed, so neither is lost from view. A flag per
  child would remove this; it changes what the app sends and is not in this version.
- **A device that floods.** An enrolled phone can send many messages or requests in a short time
  (they are permitted writes). A parent can delete requests and feed entries and remove the phone;
  chat messages are permanent by design.
- **Firebase Authentication itself.** Anyone can register an account with the owner's address
  before the owner does; it stays unconfirmed and cannot create a family, and the owner gets the
  address back with "Forgot password". Repeated wrong passwords can lock sign-in briefly.
- **Starting over.** The person who created the family can never leave it or move to another
  one, and families are never deleted by the app. Starting again from scratch needs the Firebase
  console (delete the documents and the accounts).
- **Text written by a child device.** Rules check who wrote a message, request or feed entry and
  its shape, not what the words say. The app therefore builds the wording of requests and feed
  entries from the structured fields (kind, minutes, child) instead of displaying text supplied
  by the other phone.
- **The phone itself.** Anyone holding an unlocked, enrolled phone can use it as that member.

## Client settings are not secrets

`firebase.config.json` holds the project's web client settings (API key, project id, app id).
Firebase publishes these in every app; they identify the project and grant nothing. Access is
decided only by the rules above. The repository holds no service-account key and none is needed.
