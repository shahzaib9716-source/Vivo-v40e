const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const RECEIVER = 'com.haven.familysafety.HavenAdminReceiver';

function withAdminManifest(config) {
  return withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];
    app.receiver = app.receiver || [];
    if (!app.receiver.some((receiver) => receiver.$['android:name'] === RECEIVER)) {
      app.receiver.push({
        $: {
          'android:name': RECEIVER,
          'android:permission': 'android.permission.BIND_DEVICE_ADMIN',
          'android:exported': 'true',
          'android:label': 'Haven device administrator',
        },
        'intent-filter': [{
          action: [{ $: { 'android:name': 'android.app.action.DEVICE_ADMIN_ENABLED' } }],
        }],
        'meta-data': [{
          $: {
            'android:name': 'android.app.device_admin',
            'android:resource': '@xml/haven_device_admin',
          },
        }],
      });
    }
    return config;
  });
}

function withAdminSources(config) {
  return withDangerousMod(config, ['android', async (config) => {
    const root = config.modRequest.platformProjectRoot;
    const source = path.join(root, 'app/src/main/java/com/haven/familysafety');
    const xml = path.join(root, 'app/src/main/res/xml');
    fs.mkdirSync(source, { recursive: true });
    fs.mkdirSync(xml, { recursive: true });
    fs.writeFileSync(path.join(source, 'HavenAdminReceiver.kt'), `package com.haven.familysafety

import android.app.admin.DeviceAdminReceiver

class HavenAdminReceiver : DeviceAdminReceiver()
`);
    fs.writeFileSync(path.join(xml, 'haven_device_admin.xml'), `<?xml version="1.0" encoding="utf-8"?>
<device-admin xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-policies>
        <force-lock />
    </uses-policies>
</device-admin>
`);
    return config;
  }]);
}

module.exports = (config) => withAdminSources(withAdminManifest(config));
