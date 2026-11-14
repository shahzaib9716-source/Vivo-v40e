# Looking at Haven with the sample data

A phone that is not in a family shows a sample family with two children, Mia and Leo. Nothing is
sent anywhere, so it is the quickest way to see every screen, on one phone.

## Start

1. Open the app. Swipe through the four slides or tap "Skip".
2. Choose "I'm a parent". The account screen opens: tap the back arrow to look around first.
3. To see the other side, open the Family tab and tap "Switch mode", then choose "This is my
   child's device" and go back from the Family link screen. ("Switch mode" is only offered while
   the phone is not in a family.)

"Settings", "Reset demo data" puts the sample data back to the start.

## A five-minute tour

| # | Where | What to try |
|---|---|---|
| 1 | Parent, Home | The child's card, "Needs your approval": approve "30 more minutes" and watch the ring move |
| 2 | Controls, "Screen Time" and "App Limits" | Change the daily limit; block an app |
| 3 | Controls, "Schedules & Bedtime" | "Add a schedule", fill it in, save |
| 4 | Location, "Manage" | Add a place. The map is a sample: this version does not read location |
| 5 | Home, "Messages with Mia" | Send a message. In sample mode the reply is simulated, and the screen says so |
| 6 | Family, "Switch mode", child side | Time left, "Ask for time", "Check in", tick a task under Rewards |
| 7 | Child, Home, "SOS" | Press and hold until the circle fills |
| 8 | "Switch mode", parent side | The dashboard leads with the SOS; Notifications has it and the check-in |
| 9 | Family, "Settings", "Privacy & transparency" | The same list the child sees under "What's shared with my family" |
| 10 | Activity, "Calls" | One of six labelled previews with made-up rows; nothing reads them from a device |

## The same tour with two real phones

Set the family up as in [RELEASE.md](RELEASE.md), "Before the first real use". Then steps 1 to 3
on the parent's phone appear on the child's, and steps 6 and 7 on the child's phone appear on the
parent's, while both apps are open. In a real family the app shows the agreed limit instead of
time used, and says where a number or a map is only an example.

## Questions

- **Is the sample data real?** No. It is a made-up family, saved on the phone.
- **Does it limit screen time or block apps?** No. It records and shows the rules on both phones.
  Enforcing them needs each operating system's own tools.
- **Does it track location?** No. A check-in sends the time, not the place.
- **What protects a family's data?** Sign-in, roles kept on the server, and security rules that
  were tested request by request: [SECURITY.md](SECURITY.md).
