# Setting Haven up for your family

Everything to do once, in order. About 30 minutes, plus the wait for Apple if your developer
membership is new. Details and reasons are in [SECURITY.md](SECURITY.md) and [RELEASE.md](RELEASE.md).

## 1. Firebase console (project `vivo-v40e-3ab5f`)

1. **Authentication → Sign-in method:** enable **Email/Password** (leave "Email link" off) and
   **Anonymous**. Nothing else.
2. **The security rules.** Open `firestore.rules` from this repository and change the one line
   near the top to the parent's own address, in lower case:

   ```
   function ownerEmails() { return ['your.address@example.com']; }
   ```

   Then **Firestore Database → Rules**: replace everything with the whole file and press
   **Publish**. Only an address in that list can create a family.

   Until you are ready for this step, keep the database shut by publishing
   [`firestore.lockdown.rules`](../firestore.lockdown.rules) instead. Publishing that file again is
   also the emergency stop: nobody can read or write anything, and nothing is deleted.
3. Optional: **Authentication → Templates** to set the sender name of the confirmation email.
4. Optional, recommended: **Google Cloud console → APIs & Services → Credentials →** the
   "Browser key (auto created by Firebase)": under *API restrictions* allow only Identity Toolkit
   API, Token Service API and Cloud Firestore API. Leave *Application restrictions* at **None**:
   an Android or iOS app restriction would lock Haven out.

Nothing else is needed: no indexes, no Cloud Functions, no paid plan, no service-account key.

## 2. Install the app

- **Vivo V40e (Android):** install `Haven-2.0.0-arm64.apk` (allow installing from that source
  when Android asks). Uninstall any older "Haven" or "Haven Kids" test app first: they are
  different apps and do not talk to this one.
- **iPhone:** needs an Apple Developer Program membership and an Expo account, then one build
  from your computer. Follow [RELEASE.md](RELEASE.md), "iPhone". This is the same app as on
  Android, from the same code; it has not been built for iPhone yet, so the first build is its
  first run.

## 3. Create the family (parent's phone)

1. Open Haven, skip or read the introduction, choose **"I'm a parent"**.
2. **Create account** with the address you put in `ownerEmails()` and a password you use
   nowhere else.
3. Open the confirmation email, tap the link, come back and tap **"I've confirmed it"**.
4. Enter a family name and your child's first name, then **Create family**.

## 4. Link the child's phone

1. Parent's phone: **Family → Devices & Pairing → A child's phone**. A code appears.
2. Child's phone: open Haven, choose **"This is my child's device"**, type the code.
3. The child's phone shows four characters. On the parent's phone, **type those four
   characters**, choose the child, and tap **Approve**.

If the four characters do not match, decline: someone else used the code.

## 5. Check it works

- Child's phone: tap **Check in**. The parent's dashboard shows "Checked in" within seconds.
- Parent's phone: change the daily limit. The child's phone shows the new limit.
- Both phones must have Haven open: this version does not send notifications to a closed app,
  and it does not read location, measure screen time or lock the phone. The README lists
  everything it does not do.

## Later

- **Updates without reinstalling** (JavaScript changes): [RELEASE.md](RELEASE.md), "Updating the
  app over the air". Needs the Expo account from the iPhone step.
- **A second parent:** Devices & Pairing → Another parent. They create their own account first.
- **A phone is lost:** Devices & Pairing → remove it. Its access ends; it needs a new code to
  come back.
- **Start over completely:** delete the documents and the accounts in the Firebase console
  (SECURITY.md, "Starting over").
