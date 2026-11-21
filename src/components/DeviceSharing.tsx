import { useUsageSharing } from './UsageSharing';
import { PolicyStatus } from '@/sync/policyStatus';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Button, View, AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Card, Text } from '@/components/ui';
import { device, requestFix, shareUsage, clearUsage } from '@/sync/androidDevice';
import { reportChildLocation, clearChildLocation, clearCheckins } from '@/sync/location';

import { useStore } from '@/state/store';
import { lowBattery, usePowerThreshold } from '@/sync/power';
import { CrossingSession } from '@/sync/placeCrossing';

export function DeviceSharing({ family, child, uid }: { family: string; child: string; uid: string }) {
  const { places } = useStore();
  const threshold = usePowerThreshold(family, child)?.percent ?? 0;
  const automatic = useUsageSharing();
  const management = useContext(PolicyStatus);
  const [sharing, setSharing] = useState(false);
  const firstFix = useRef<Awaited<ReturnType<typeof requestFix>> | undefined>(undefined);
  const focused = useRef(false);
  const generation = useRef(0);
  const stop = useCallback(() => {
    generation.current++;
    setSharing(false);
  }, []);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    const sub = AppState.addEventListener('change', state => { if (state !== 'active') stop(); });
    return () => { focused.current = false; sub.remove(); stop(); };
  }, [stop]));
  const mounted = useRef(false);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!sharing) return;
    const token = generation.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const session = new CrossingSession();
    if (firstFix.current) session.update(places, firstFix.current);
    firstFix.current = undefined;
    const active = () => !disposed && token === generation.current && AppState.currentState === 'active';
    async function report() {
      try {
        if (await lowBattery(threshold, device?.batteryPercent ? () => device!.batteryPercent!() : undefined)) {
          if (active()) { setStatus('GPS updates paused for low battery.'); timer = setTimeout(report, 60000); }
          return;
        }
        if (!active()) return;
        const fix = await device!.currentFix();
        if (!active()) return;
        await reportChildLocation(family, child, uid, fix.latitude, fix.longitude, fix.accuracyM, fix.measuredAt, false, session.update(places, fix));
        if (active()) {
          setStatus('Foreground location sharing is on.');
          timer = setTimeout(report, 60000);
        }
      } catch (e) {
        if (!active()) return;
        setStatus(e instanceof Error ? e.message : 'Sharing stopped. Check permission and connectivity.');
        stop();
      }
    }
    timer = setTimeout(report, 60000);
    return () => { disposed = true; clearTimeout(timer); };
  }, [sharing, family, child, uid, stop, places, threshold]);
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
    if (!focused.current || !mounted.current || AppState.currentState !== 'active') throw Error('Open Haven to share this report.');
  }
  return <Card><View style={{ gap: 8 }}>
    <Text variant="title">Share from this phone</Text>
    <Text>Your paired parent can see the latest report until you clear or replace it. While sharing every minute, crossings of saved family places can create arrival and departure alerts.</Text>
    <Button title="Share my current location once" disabled={busy || sharing} onPress={() => run(async () => {
      const fix = await requestFix();
      foreground();
      await reportChildLocation(family, child, uid, fix.latitude, fix.longitude, fix.accuracyM, fix.measuredAt);
    }, 'Location shared.')} />
    <Text>Saved check-ins are visible to your paired parent. Haven keeps one per UTC hour of the day, up to 24. Saving again in the same slot replaces the older point.</Text>
    <Button title="Save my location to check-in history" disabled={busy} onPress={() => run(async () => {
      const fix = await requestFix();
      foreground();
      await reportChildLocation(family, child, uid, fix.latitude, fix.longitude, fix.accuracyM, fix.measuredAt, true);
    }, 'Check-in saved.')} />
    <Button title="Clear saved check-ins" disabled={busy} onPress={() => run(() => clearCheckins(family, child), 'Check-in history cleared.')} />
    <Button title={sharing ? 'Stop location updates' : 'Share every minute while Me is open'} disabled={busy} onPress={() => {
      if (sharing) { stop(); setStatus('Location updates stopped.'); return; }
      run(async () => {
        const fix = await requestFix();
        foreground();
        const token = generation.current;
        await reportChildLocation(family, child, uid, fix.latitude, fix.longitude, fix.accuracyM, fix.measuredAt);
        if (mounted.current && token === generation.current) { firstFix.current = fix; setSharing(true); }
      }, 'Location shared.');
    }} />
    <Button title="Clear shared location" disabled={busy} onPress={() => run(() => { stop(); return clearChildLocation(family, child); }, 'Location cleared.')} />
    <Text>Usage reports include launchable apps, their package names, and foreground time since midnight on this phone. Sharing includes up to seven days of foreground totals available from Android. Clear shared usage removes these totals.</Text>
    <Button title="Open Android usage access" disabled={busy} onPress={() => run(() => native.openUsageSettings(), 'Return here and tap Share app usage.')} />
    <Button title="Share app usage" disabled={busy} onPress={() => run(async () => {
      const report = await native.readUsage();
      foreground();
      await shareUsage(family, child, uid, report.apps, report.measuredAt, report.screenMs, report.days);
    }, 'Usage report shared.')} />
    {automatic && <>
      <Text>If enabled, Haven refreshes usage when this linked child app opens or reconnects and every 15 minutes while open. This choice is saved on this phone.</Text>
      <Button title={automatic.enabled ? 'Stop automatic usage sharing' : 'Enable automatic usage sharing'} disabled={busy || !automatic.ready}
        onPress={() => run(() => automatic.setEnabled(!automatic.enabled), 'Sharing setting saved.')} />
      <Text accessibilityLiveRegion="polite">{automatic.status}</Text>
    </>}
    <Button title="Clear shared usage" disabled={busy || !automatic?.ready} onPress={() => run(async () => {
      await automatic?.setEnabled(false);
      await clearUsage(family, child);
    }, 'Usage report cleared.')} />
    <Text>{management}</Text>
    <Text accessibilityLiveRegion="polite">{status}</Text>
  </View></Card>;
}
