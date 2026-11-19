# Vivo V40e Device Owner testing

Haven uses the existing Android receiver `com.haven.familysafety/expo.modules.havendevice.HavenAdmin`. Android reads its policy metadata from `@xml/haven_admin`. Legacy Device Administrator activation is optional. App suspension requires Android to report Haven as Device Owner.

## ADB test provisioning

Use an authorized Vivo V40e test phone and the signed Haven APK. Use a phone with no other Android users, work profile, Android accounts, or existing device owner. Leave the phone's existing accounts and data in place if it is ineligible. If a reset is being considered, it erases local apps, accounts, settings and data. Backups and explicit owner approval are required before proceeding.

On the test phone, enable USB debugging in Developer options and approve the trusted ADB host on the phone. Run these commands against the connected test phone.

```sh
adb devices
adb install -r Haven.apk
adb shell dpm set-device-owner com.haven.familysafety/expo.modules.havendevice.HavenAdmin
adb shell dpm list-owners
```

Use the actual file name in the install command. With multiple devices connected, pass `-s SERIAL` to every command. If Android rejects enrollment, record the exact output and stop. Setup state and OEM restrictions still apply. Haven's Firebase sign-in and family pairing can follow a successful enrollment.

In an updated Haven build, open Child Profile, then Child device permissions. Check that Device Owner shows Enrolled. On the parent phone, set an explicit rule for a nonessential app, open Haven on the Vivo, and verify the package actually stops launching. Remove the rule, verify restoration, then repeat across reboot. Give Usage Access for usage-based restrictions. Persisted Android jobs can be delayed by the system.

## QR and Vivo behavior

The current manifest registers the ADB test receiver. Android 12 and newer QR enrollment also requires provisioning-mode and policy-compliance activity handlers, plus deployment configuration. Those components are absent from this build. ADB test eligibility and post-reboot scheduling on the Vivo V40e with Android 16 require handset verification. The Android battery exemption flag and Funtouch OS autostart settings are separate.

- [Android Enterprise developer guide](https://developer.android.com/work/guide.html)
- [ADB reference](https://developer.android.com/tools/adb)
- [Android provisioning requirements](https://source.android.com/docs/devices/admin/provision)
