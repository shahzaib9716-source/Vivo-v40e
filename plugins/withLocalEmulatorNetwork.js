const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const RESOURCE = 'haven_test_network';

/**
 * Test builds only: lets the Android app reach a local Firestore emulator over plain HTTP.
 *
 * Android refuses plain HTTP by default, and from Android 17 it ignores the old
 * `android:usesCleartextTraffic` switch for apps that target it. So a build pointed at an
 * emulator gets a network security config that allows plain HTTP to that one host and nothing
 * else. app.config.js adds this plugin only when HAVEN_FIRESTORE_EMULATOR is set; a normal
 * build talks to Firebase over HTTPS and never includes it.
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
    return cfg;
  });
};
