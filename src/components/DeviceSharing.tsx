import { PolicyStatus } from '@/sync/policyStatus';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Button, View, AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Card, Text } from '@/components/ui';
import { device, requestFix, shareUsage, clearUsage } from '@/sync/androidDevice';
import { reportChildLocation, clearChildLocation } from '@/sync/location';

export function DeviceSharing({ family, child, uid }: { family: string; child: string; uid: string }) {
  const management = useContext(PolicyStatus);
  const [sharing, setSharing] = useState(false);
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
    const active = () => !disposed && token === generation.current && AppState.currentState === 'active';
    async function report() {
      try {
        const fix = await device!.currentFix();
        if (!active()) return;
        await reportChildLocation(family, child, uid, fix.latitude, fix.longitude, fix.accuracyM, fix.measuredAt);
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
  }, [sharing, family, child, uid, stop]);
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
    <Text>Your paired parent can see the latest report until you clear or replace it.</Text>
    <Button title="Share my current location once" disabled={busy || sharing} onPress={() => run(async () => {
      const fix = await requestFix();
      foreground();
      await reportChildLocation(family, child, uid, fix.latitude, fix.longitude, fix.accuracyM, fix.measuredAt);
    }, 'Location shared.')} />
    <Button title={sharing ? 'Stop location updates' : 'Share every minute while Me is open'} disabled={busy} onPress={() => {
      if (sharing) { stop(); setStatus('Location updates stopped.'); return; }
      run(async () => {
        const fix = await requestFix();
        foreground();
        const token = generation.current;
        await reportChildLocation(family, child, uid, fix.latitude, fix.longitude, fix.accuracyM, fix.measuredAt);
        if (mounted.current && token === generation.current) setSharing(true);
      }, 'Location shared.');
    }} />
    <Button title="Clear shared location" disabled={busy} onPress={() => run(() => { stop(); return clearChildLocation(family, child); }, 'Location cleared.')} />
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
