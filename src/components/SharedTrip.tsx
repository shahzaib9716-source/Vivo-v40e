import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { Button, Text } from '@/components/ui';
import { device } from '@/sync/androidDevice';
import { newId } from '@/sync/ids';
import { useLink } from '@/sync/link';
import { clearTripPoints, reportChildLocation } from '@/sync/location';
import { CrossingSession } from '@/sync/placeCrossing';
import { useStore } from '@/state/store';

interface TripControls {
  active: boolean;
  busy: boolean;
  message: string;
  start(threshold: number): Promise<void>;
  stop(): Promise<void>;
  clear(): Promise<void>;
}
const Trip = createContext<TripControls | null>(null);

export function SharedTripProvider({ children }: { children: ReactNode }) {
  const link = useLink();
  const uid = link.account?.uid;
  const target = link.role === 'child' && uid && link.familyId && link.childId ? [link.familyId, link.childId, uid].join('/') : '';
  return <TripSession key={target} scope={target}>{children}</TripSession>;
}

function TripSession({ scope, children }: { scope: string; children: ReactNode }) {
  const [family, child, uid] = scope.split('/');
  const { places } = useStore();
  const savedPlaces = useRef(places);
  useEffect(() => { savedPlaces.current = places; }, [places]);
  const session = useRef<string | null>(null);
  const validScope = useRef(false);
  const crossings = useRef(new CrossingSession());
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const stop = useCallback(async () => {
    session.current = null;
    await device?.endTrip?.();
    setActive(false);
    setMessage('Trip sharing stopped.');
  }, []);
  useEffect(() => {
    if (!scope || !device?.addListener || !device.startTrip) return;
    validScope.current = true;
    const sub = device.addListener('onTrip', event => {
      if (event.scope !== scope || event.session !== session.current) return;
      if (event.event === 'stopped') {
        session.current = null;
        setActive(false);
        setMessage(event.message || 'Trip sharing ended.');
      } else if (event.event === 'started') {
        setActive(true);
        setMessage('Trip sharing is on. Android shows a Stop sharing action in your notifications.');
      } else {
        const { latitude, longitude, accuracyM, measuredAt } = event;
        if (latitude == null || longitude == null || accuracyM == null || measuredAt == null) return;
        const transitions = crossings.current.update(savedPlaces.current, { latitude, longitude, accuracyM, measuredAt });
        void reportChildLocation(family, child, uid, latitude, longitude, accuracyM, measuredAt, false, transitions, event.session)
          .then(() => { if (session.current === event.session) setMessage('Last shared at ' + new Date(measuredAt).toLocaleTimeString()); })
          .catch((e: unknown) => {
            if (session.current !== event.session) return;
            if (e && typeof e === 'object' && 'code' in e && e.code === 'permission-denied') {
              void stop();
            } else setMessage('Could not send this location. Haven will try again at the next update.');
          });
      }
    });
    return () => {
      validScope.current = false;
      session.current = null;
      sub.remove();
      void device?.endTrip?.().catch(() => {});
    };
  }, [scope, family, child, uid, stop]);

  async function start(threshold: number) {
    if (lock.current || session.current || !device?.startTrip || !scope) return;
    lock.current = true;
    setBusy(true);
    try {
      const { ACCESS_COARSE_LOCATION, ACCESS_FINE_LOCATION, POST_NOTIFICATIONS } = PermissionsAndroid.PERMISSIONS;
      const grants = await PermissionsAndroid.requestMultiple([ACCESS_COARSE_LOCATION, ACCESS_FINE_LOCATION]);
      if (grants[ACCESS_COARSE_LOCATION] !== 'granted' && grants[ACCESS_FINE_LOCATION] !== 'granted') throw Error('Location permission is required to share this trip.');
      if (Number(Platform.Version) >= 33 && await PermissionsAndroid.request(POST_NOTIFICATIONS) !== 'granted') throw Error('Allow the visible trip notification to start sharing.');
      if (!validScope.current || AppState.currentState !== 'active') return;
      const id = newId('trip');
      session.current = id;
      crossings.current = new CrossingSession();
      setMessage('Starting trip sharing…');
      await device.startTrip(scope, id, threshold);
    } catch (e) {
      session.current = null;
      setMessage(e instanceof Error ? e.message : 'Could not start sharing.');
    } finally { lock.current = false; setBusy(false); }
  }
  async function clear() {
    if (lock.current || session.current) return;
    lock.current = true;
    setBusy(true);
    try { await clearTripPoints(family, child); setMessage('Trip history removed.'); }
    catch { setMessage('Could not remove trip history. Reconnect and retry.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Trip.Provider value={scope && device?.startTrip ? { active, busy, message, start, stop, clear } : null}>{children}</Trip.Provider>;
}

export function TripControlsView({ threshold, otherSharing }: { threshold: number; otherSharing: boolean }) {
  const trip = useContext(Trip);
  if (!trip) return null;
  return <>
    <Text variant="title">Share a trip</Text>
    <Text>Your paired parent can see your route and place crossings for up to 30 minutes, including while the screen is locked. End sharing here or from the Android notification. Up to 240 trip points stay in history until replaced or cleared.</Text>
    <Button label={trip.active ? 'Stop sharing my trip' : 'Share my trip for 30 minutes'} disabled={trip.busy || (!trip.active && otherSharing)}
      onPress={() => { void (trip.active ? trip.stop() : trip.start(threshold)); }} />
    <Button label="Clear trip history" variant="ghost" disabled={trip.busy || trip.active} onPress={trip.clear} />
    {trip.message ? <Text accessibilityLiveRegion="polite">{trip.message}</Text> : null}
  </>;
}
export function useTripActive() { return useContext(Trip)?.active ?? false; }
