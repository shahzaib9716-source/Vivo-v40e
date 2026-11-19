import { PolicyStatus } from '@/sync/policyStatus';
import { useContext, useEffect, useRef, useState } from 'react';
import { Button, View, AppState } from 'react-native';
import { Card, Text } from '@/components/ui';
import { device, requestFix, shareUsage, clearUsage } from '@/sync/androidDevice';
import { reportChildLocation, clearChildLocation } from '@/sync/location';

export function DeviceSharing({ family, child, uid }: { family: string; child: string; uid: string }) {
  const management = useContext(PolicyStatus);
  const mounted = useRef(false);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  if (!device) return null;
  const native = device;
  async function run(work: () => Promise<void>, success: string) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setStatus('Working…');
    try { await work(); if (mounted.current) setStatus(success); }
    catch (e) { if (mounted.current) setStatus(e instanceof Error ? e.message : 'Could not complete this action. Please retry.'); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  function foreground() {
    if (!mounted.current || AppState.currentState !== 'active') throw Error('Open Haven to share this report.');
  }
  return <Card><View style={{ gap: 8 }}>
    <Text variant="title">Share from this phone</Text>
    <Text>Each tap shares one report with your paired parent. It stays visible until cleared or replaced.</Text>
    <Button title="Share my current location" disabled={busy} onPress={() => run(async () => {
      const fix = await requestFix();
      foreground();
      await reportChildLocation(family, child, uid, fix.latitude, fix.longitude, fix.accuracyM);
    }, 'Location shared.')} />
    <Button title="Clear shared location" disabled={busy} onPress={() => run(() => clearChildLocation(family, child), 'Location cleared.')} />
    <Text>Usage reports include launchable apps, their package names, and foreground time since midnight on this phone.</Text>
    <Button title="Open Android usage access" disabled={busy} onPress={() => run(() => native.openUsageSettings(), 'Return here and tap Share app usage.')} />
    <Button title="Share app usage" disabled={busy} onPress={() => run(async () => {
      const report = await native.readUsage();
      foreground();
      await shareUsage(family, child, uid, report.apps, report.measuredAt, report.screenMs);
    }, 'Usage report shared.')} />
    <Button title="Clear shared usage" disabled={busy} onPress={() => run(() => clearUsage(family, child), 'Usage report cleared.')} />
    <Text>{management}</Text>
    <Text accessibilityLiveRegion="polite">{status}</Text>
  </View></Card>;
}
