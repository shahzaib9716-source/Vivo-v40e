import { Platform } from 'react-native';

/**
 * What Haven can do on this phone, by platform.
 *
 * Haven is one codebase for Android and iOS. Everything that travels between the phones (rules,
 * requests, check-ins, chat, tasks, SOS) is the same on both. What differs is what each operating
 * system lets an app do to the phone itself, and that is described here in one place, so screens ask
 * this module instead of testing `Platform.OS` themselves.
 *
 * This version contains no native device-management module: it reads nothing from the phone and
 * locks nothing on it, on either platform. `implemented` is therefore false for every device
 * feature below. When one is built, it becomes a native module behind this same list (and a new
 * build, not an over-the-air update), and `platform` already says where it can exist.
 */

export type DeviceFeature = 'usage' | 'blocking' | 'location' | 'notifications';

export interface FeatureInfo {
  key: DeviceFeature;
  title: string;
  /** True once this build really does it on this platform. */
  implemented: boolean;
  /** Whether the operating system allows an app to do it at all, and on what terms. */
  platform: 'possible' | 'restricted';
  /** One sentence for the person reading: what would be needed on this phone. */
  note: string;
}

const os = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

const NOTES: Record<DeviceFeature, Record<'ios' | 'android' | 'web', { platform: FeatureInfo['platform']; note: string }>> = {
  usage: {
    android: { platform: 'possible', note: 'Android can report app use to an app the family has given “Usage access” in system settings. That needs a native module that this version does not include.' },
    ios: { platform: 'restricted', note: 'On iPhone, app use is only available through Apple’s Screen Time framework, which needs a special permission from Apple for the app. Until then, use Screen Time in iOS Settings.' },
    web: { platform: 'restricted', note: 'A browser cannot see how a device is used.' },
  },
  blocking: {
    android: { platform: 'possible', note: 'Android lets a family-safety app hold back apps only with extra system permissions and a native module. This version shows the agreed rules; it does not hold apps back.' },
    ios: { platform: 'restricted', note: 'On iPhone, only Apple’s Screen Time can limit or block apps. Haven shows the agreed rules; set the same limits in iOS Settings, Screen Time, to enforce them.' },
    web: { platform: 'restricted', note: 'A browser cannot limit other apps.' },
  },
  location: {
    android: { platform: 'possible', note: 'Android shares location with an app only after the person using the phone allows it. This version does not ask for it: check-ins send the time, not the place.' },
    ios: { platform: 'possible', note: 'iPhone shares location with an app only after the person using the phone allows it. This version does not ask for it: check-ins send the time, not the place.' },
    web: { platform: 'possible', note: 'This version does not ask for location.' },
  },
  notifications: {
    android: { platform: 'possible', note: 'Alerts appear while Haven is open. Notifications to a closed app need a push service set up for the app, which this version does not have.' },
    ios: { platform: 'possible', note: 'Alerts appear while Haven is open. Notifications to a closed app need Apple’s push service set up for the app, which this version does not have.' },
    web: { platform: 'restricted', note: 'Alerts appear while the page is open.' },
  },
};

const TITLES: Record<DeviceFeature, string> = {
  usage: 'Measuring screen time and app use',
  blocking: 'Locking the phone or blocking apps',
  location: 'Reading the phone’s location',
  notifications: 'Notifications when the app is closed',
};

/** Device features in a fixed order, described for the platform this app is running on. */
export function deviceFeatures(): FeatureInfo[] {
  return (Object.keys(TITLES) as DeviceFeature[]).map((key) => ({ key, title: TITLES[key], implemented: false, ...NOTES[key][os] }));
}

/** True when this build really does `feature` on this phone. Screens use it to decide what to show as real. */
export function hasFeature(feature: DeviceFeature): boolean {
  return deviceFeatures().some((f) => f.key === feature && f.implemented);
}

/** What works in a linked family on every platform: it only needs the two apps and a connection. */
export const SYNCED_FEATURES: readonly { icon: string; title: string; detail: string }[] = [
  { icon: 'sliders', title: 'Rules and limits', detail: 'What a parent sets appears on the child’s phone' },
  { icon: 'send', title: 'Requests', detail: 'More time, unlocking an app; answered by a parent' },
  { icon: 'check-circle', title: 'Check-ins', detail: 'One tap from the child, with the time' },
  { icon: 'message-circle', title: 'Messages', detail: 'Chat between parent and child inside Haven' },
  { icon: 'award', title: 'Tasks and rewards', detail: 'Ticked by the child, seen by the parent' },
  { icon: 'alert-circle', title: 'SOS', detail: 'Raised by the child, shown on the parent’s phone while Haven is open' },
];
