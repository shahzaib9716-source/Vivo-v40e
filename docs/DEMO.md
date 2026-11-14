# Presenting Haven in five minutes

Haven is a family-safety app with a parent side and a child side. This script walks a judge through it. Every label in quotes is what is on screen.

## Before you start

1. **Install.** Copy `haven-parent.apk` (installs as **Haven**) and `haven-child.apk` (installs as **Haven Kids**) to the phone and open each one. Android asks once to allow installing from that source. Or run the combined app in Expo Go (`npx expo start`).
2. **Start from clean data.** In Haven: Family tab, "Settings", "Reset demo data", confirm. Changes are saved on the phone, so a rehearsal leaves traces until you reset.
3. **One phone or two.** The two apps do not talk to each other: there is no server in this build, so each app keeps its own data. One phone shows the whole story best. Use the row "Demo: preview the child app on this device" (parent, Family tab) and "Demo: back to the parent app" (child, Me tab) to move between sides with the same data. With two phones, show Haven on one and Haven Kids on the other and say plainly that linking them needs a backend.
4. **Light or dark.** The app follows the phone's setting. Pick one before you begin.

## The walkthrough

| # | Time | Tap | Say |
|---|---|---|---|
| 1 | 0:00 | Open **Haven**. Swipe or tap "Next" through the four slides, then "Get started". | "The introduction states the idea: limits agreed together, and nothing hidden from the child." |
| 2 | 0:30 | On the dashboard, point at Mia's card: time left, battery, "School". Under "Needs your approval", tap "Approve" on "30 more minutes". | "One screen answers the three questions a parent has: how long, where, and does anyone need me. Approving adds the time straight away: the ring moves from 1h 12m to 1h 42m." |
| 3 | 1:00 | Controls tab, "Screen Time". Tap the minus and plus, then a preset. Go back, open "App Limits" and switch one app off. | "Daily limit in steps of 15 minutes, and per-app limits or a block. The dashboard's 'Apps blocked' count follows." |
| 4 | 1:30 | Controls tab, "Schedules & Bedtime", "Add a schedule". Fill it in and save. | "Bedtime and school hours repeat on the days you choose. This is a real form, and it is saved." |
| 5 | 2:00 | Location tab. Then "Manage" and "Add a place". | "Where the child is, and places that send an alert on arrival or departure. Location sharing is never hidden from the child." |
| 6 | 2:20 | Home tab, "Messages with Mia". Tap a quick reply such as "Time for dinner". | "An open family chat. Both sides see the same messages. In this demo the reply is simulated, and the screen says so." |
| 7 | 2:40 | Family tab, "Demo: preview the child app on this device". (Two phones: pick up the one with **Haven Kids**.) | "This is what the child sees: time left, what they can use now, and three big actions." |
| 8 | 3:00 | "Ask for time", then "+30". Then go back to Home and tap "Check in". Open the Rewards tab and tick a task. | "The child asks instead of arguing with a locked screen. A check-in shares where they are, on their terms. Tasks earn points toward rewards the parent set." |
| 9 | 3:30 | Home tab, "SOS". Press and hold "Hold to send" until the circle fills. | "Press-and-hold, so it cannot be sent by accident. It says exactly what happens: the family is alerted and sees the location." |
| 10 | 3:50 | Close the SOS screen. Me tab, "Demo: back to the parent app". | "On the parent's side the dashboard now leads with 'SOS from Mia', with 'View location' and 'Mark as safe'. Notifications has the alert and the earlier check-in." |
| 11 | 4:20 | Family tab, "Settings", "Privacy & transparency". | "The transparency screen. The child has the same list under 'What's shared with my family': what the family can see, and what it cannot, including message content and photos." |
| 12 | 4:40 | Activity tab, "Calls". | "These six categories are labelled previews with sample rows. They read nothing from a real device. We built the screens to show where they would sit, and left the monitoring out on purpose." |

## Showing the SOS loop on one phone

Steps 7 to 10 above are the loop. The preview rows exist because there is no server: the child side and the parent side read the same saved data only when they run inside the same app. If a judge asks why, the honest answer is in the next section.

## What is a preview, and why

Calls, Messages, Social Apps, Browsing History, Video Watch History and Keyword Alerts are on the Activity tab with a "Preview" badge. Each screen carries a notice that it shows sample data and that live monitoring is not connected. Haven's position is that a child should know what is shared, so reading private messages or calls is not something this build does.

## Questions a judge may ask

- **Is the data real?** No. It is demo data for a family with two children, saved on the phone. Every change you make is real within the app and survives a restart.
- **Do the two apps sync?** No. There is no backend in this build. Each app keeps its own data, and the preview rows show both sides on one device.
- **Does it really limit screen time or block apps?** No. The app shows and records the rules. Enforcing them needs the operating system's own tools: Android's device-management and usage APIs, and Apple's Screen Time APIs.
- **What would a production version need?** Accounts and pairing between devices, a backend to sync rules and alerts, the operating-system APIs above for enforcement and real location, push notifications, and store review, which for this category is strict.
- **Why is the installed app signed with a debug key?** It is a demo build for installing directly. A store release would use a release key.
- **What was it built with?** React Native and Expo, in TypeScript. One codebase produces the combined app, Haven and Haven Kids.

## Design decisions worth pointing out

- **Transparency by design.** The same "What's shared" list is available to the child and the parent, and nothing in the app runs in secret.
- **Requests instead of walls.** The child can ask for time or for an app, and the parent answers in one tap.
- **A deliberate SOS.** Press-and-hold to send, a clear sent state, and "I'm safe now" to end it.
- **Readable for everyone.** Text contrast meets the 4.5:1 guideline on the main surfaces, every control has an accessible name, and targets are at least 44 points.
- **Light and dark.** Every screen is designed for both.
- **Two apps, one codebase.** Haven and Haven Kids are built from the same source by one setting, each with its own name, icon and package.
