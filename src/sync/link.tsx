import { createContext, ReactNode, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { useStore } from '@/state/store';
import { FIRESTORE_EMULATOR } from './config';
import { LinkController } from './controller';
import type { LinkState } from './types';

/**
 * Puts the link layer into React. All of the work happens in plain modules:
 *
 *   ./controller  who is signed in, which family this device is in, pairing, the status
 *   ./engine      the listeners and writes of a linked session, on top of ./reconcile
 *   ./remote      Cloud Firestore        ./auth  Firebase Authentication
 *
 * This component only connects them to the store:
 * - it hands the store's functions to the controller (`applyRemote`, the reset, `setLive`, ...);
 * - it reports every commit of the synced slices (`syncSnapshot`) to the controller, together with
 *   `seq`, a counter the controller sets in the same tick as each hand-over to the store. Both
 *   commit together, so the engine knows exactly which of its hand-overs a snapshot includes;
 * - it mirrors the controller's view (status, members, the code on offer, ...) into context.
 */

const Ctx = createContext<LinkState | null>(null);

export function LinkProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  // `wipeToSample` is the reset without the "not while in a family" check: the link layer calls it
  // exactly when a device has left its family.
  const { syncSnapshot, applyRemote, readSyncRecord, wipeToSample, setSelfChildId, setLive } = store;
  const [controller] = useState(() => new LinkController());
  const [seq, setSeq] = useState(0);

  // Every one of these functions is stable, so this runs once: start on mount, shut down on unmount.
  useEffect(
    () => controller.attach({ applyRemote, readSyncRecord, resetDemoData: wipeToSample, setSelfChildId, setLive, mark: setSeq }),
    [controller, applyRemote, readSyncRecord, wipeToSample, setSelfChildId, setLive],
  );

  useEffect(() => {
    controller.storeChanged(syncSnapshot, seq);
  }, [controller, syncSnapshot, seq]);

  // Presence and retries follow the app coming to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => controller.appActive(state === 'active'));
    return () => sub.remove();
  }, [controller]);

  const view = useSyncExternalStore(controller.subscribe, controller.getView, controller.getView);
  const value = useMemo<LinkState>(() => ({ ...view, ...controller.actions }), [view, controller]);

  // Test builds only (a Firestore emulator is configured, which no released build has): lets a
  // browser test drive both phones through `window.__haven.link` and `window.__haven.store`.
  useEffect(() => {
    if (!FIRESTORE_EMULATOR || Platform.OS !== 'web' || typeof window === 'undefined') return;
    (window as unknown as { __haven?: unknown }).__haven = { link: value, store };
  }, [value, store]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLink(): LinkState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLink must be used within LinkProvider');
  return v;
}
