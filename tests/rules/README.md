# Security-rules tests

These tests run `firestore.rules` in the Firestore emulator and check, request by request, who is
allowed to do what. They never contact a real Firebase project.

## Run

With a Firestore emulator already listening on `127.0.0.1:8085` (or wherever
`FIRESTORE_EMULATOR_HOST` points):

```bash
npm run test:rules
```

On a machine with nothing running (needs Java; the Firebase CLI downloads the emulator once):

```bash
npx firebase-tools emulators:exec --only firestore --project demo-haven 'npm run test:rules'
```

One file, or a more readable report:

```bash
node --test --test-concurrency=1 tests/rules/05-pairing-abuse.test.mjs
node --test --test-concurrency=1 --test-reporter=spec tests/rules/*.test.mjs
```

The files must run one after the other (`--test-concurrency=1`): they share one emulator project,
`demo-haven-rules`, and each loads the rules into it and resets its data. To work on one file while
the suite runs, give it its own project: `HAVEN_RULES_PROJECT=demo-haven-mine node --test ...`.

## What is where

| File | Covers |
|---|---|
| `helpers.mjs` | Emulator connection, the personas and their tokens, documents as the app writes them, the arranged world, the flows of SPEC section 3, the operation catalogue for the access matrix |
| `01-legitimate-flows` | Family creation and seeding, pairing from code to enrolment, every listener and every write of each role, leaving and removal, and the access matrix for both parents |
| `02-unauthorised` | No token, anonymous stranger, verified stranger, unverified stranger, unverified account using the owner's address: against every operation, and trying to create a family |
| `03-cross-family` | A parent and a child of another family against every operation of family A |
| `04-child-escalation` | An enrolled child device trying to do what only a parent may |
| `05-pairing-abuse` | Guessing, claiming, reading, approving, reusing and creating pairing codes |
| `06-integrity` | Forged signatures, client-made times, missing or extra fields, wrong types and sizes, immutable fields, the founder, one family per account |
| `07-access-call-budget` | The document lookups the rules make stay within Firestore's limits |
| `08-red-team` | Attacks by someone who did not write the rules, from ten positions (no account to a second parent), sent through the SDK and the REST API. Tests marked FOUND are the two holes it found, now closed; KNOWN LIMIT and BY DESIGN tests show what the rules cannot or do not mean to stop |

The **access matrix** is one table of about 130 operations (`OPS` in `helpers.mjs`), each written
the way its rightful author issues it, with the list of personas for whom it must succeed. Every
persona is run against every operation: it must succeed for the listed ones and be refused for
all others.

## Personas

Tokens carry what Firebase Auth really issues (compared with tokens from the Auth emulator):
anonymous sign-in has no email claims; a password account has `email`, `email_verified` and the
`password` provider. Family B is arranged with the rules switched off because its founder is not
on the owner list.

The tests run the rules file as it is, with one substitution: the list in `ownerEmails()` is
replaced by the tests' own address, `owner@example.com`, which only the founder persona holds
verified. So the real owner address can be put into `firestore.rules` before publishing without
touching the tests, and no real address is needed in them. One test reads the real list and
checks that every entry is a lower-case address (Firebase Auth lower-cases addresses; the rules
compare exactly).

## Checking that the tests notice a weakened rule

`HAVEN_RULES_FILE` points the suite at another rules file. Copy `firestore.rules`, weaken one
condition, and run:

```bash
HAVEN_RULES_FILE=/path/to/weakened.rules npm run test:rules
```

At least one test must fail. If none does, a test is missing.

## Good to know

- A refused request is reported as `permission-denied`. In the emulator the error message also
  says which rule line refused; the real service does not send that.
- States that cannot be reached through the rules (an expired code, an overdue approval) are
  written with `withSecurityRulesDisabled`.
- `@firebase/rules-unit-testing@6.0.0` asks for Node 24.12 or newer in its `engines` field and
  prints a warning on older versions when installing. The suite was written and run on Node 22.
