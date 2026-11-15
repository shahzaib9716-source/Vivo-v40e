const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const RESOURCE = 'haven_test_network';
const LOCAL_NETWORK = 'android.permission.ACCESS_LOCAL_NETWORK';

/**
 * Test builds only: lets the Android app reach local Firebase emulators.
 *
 * Two things stand in the way on Android 17, and this plugin deals with both:
 *
 * 1. Plain HTTP. Android refuses it by default, and from Android 17 it ignores the old
 *    `android:usesCleartextTraffic` switch for apps that target it. So the build gets a network
 *    security config that allows plain HTTP to the emulator's one host and nothing else.
 * 2. Local Network Protection. An app that targets Android 17 cannot reach addresses on the
 *    device's own network (10.0.2.2, the host as an Android emulator sees it, is one) without the
 *    ACCESS_LOCAL_NETWORK permission. It is a runtime permission: after installing a test build,
 *    grant it with
 *      adb shell pm grant com.haven.familysafety android.permission.ACCESS_LOCAL_NETWORK
 *
 * app.config.js adds this plugin only when an emulator environment variable is set. A normal
 * build talks to Firebase over HTTPS on the internet and gets neither the config nor the permission.
 */
module.exports = function withLocalEmulatorNetwork(config, { host } = {}) {
  if (typeof host !== 'string' || !/^[A-Za-z0-9.-]+$/.test(host)) {
    throw new Error(`HAVEN_FIRESTORE_EMULATOR needs a plain host name or IP address before the port, got "${host}".`);
  }

  const xml = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!-- Generated for a test build that uses a local Firestore emulator. -->',
    '<network-security-config>',
    '  <domain-config cleartextTrafficPermitted="true">',
    `    <domain includeSubdomains="false">${host}</domain>`,
    '  </domain-config>',
    '</network-security-config>',
    '',
  ].join('\n');

  const withFile = withDangerousMod(config, [
    'android',
    (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${RESOURCE}.xml`), xml);
      return cfg;
    },
  ]);

  return withAndroidManifest(withFile, (cfg) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    application.$['android:networkSecurityConfig'] = `@xml/${RESOURCE}`;
    const manifest = cfg.modResults.manifest;
    const permissions = manifest['uses-permission'] ?? [];
    if (!permissions.some((p) => p.$?.['android:name'] === LOCAL_NETWORK)) {
      permissions.push({ $: { 'android:name': LOCAL_NETWORK } });
    }
    manifest['uses-permission'] = permissions;
    return cfg;
  });
};
