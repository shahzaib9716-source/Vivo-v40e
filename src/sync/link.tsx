import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Vibration } from 'react-native';

import { loadState, serialiseState, type PersistedState } from '@/state/persist';
import { readKey, removeKey, writeKey } from '@/state/storage';
import { useStore } from '@/state/store';
import { isBackendConfigured } from './config';
import {
  createFamily,
  createPairing,
  fetchFamily,
  pushSlices,
  randomId,
  redeemPairing,
  removeMember,
  removePairing,
  toLinkError,
  touchMember,
  watchFamily,
  writeMember,
  type FamilySnapshot,
  type SliceJson,
} from './remote';
import {
  LinkError,
  normalisePairingCode,
  PAIRING_CODE_LENGTH,
  SYNCED_SLICES,
  type LinkedDevice,
  type LinkRole,
  type LinkState,
  type LinkStatus,
  type MemberRecord,
  type PairingCode,
  type SyncedSlice,
  type SyncedState,
} from './types';

/**
 * Keeps this device's shared data in step with its family in Cloud Firestore.
 *
 * For every shared slice the provider remembers the value both sides last agreed on (`agreed`).
 * - The store changed and differs from `agreed`: send it. The send is a transaction that merges
 *   this phone's change with whatever the server holds by then (see ./merge).
 * - The server changed and this phone has nothing unsent for that slice: adopt the server's value.
 * - Both changed: the send takes care of it.
 * `agreed` is saved with the link, so changes made while the app was closed or offline still
 * merge correctly after a restart.
 */

const LINK_KEY = 'haven.link.v1';
const DEVICE_KEY = 'haven.device.v1';
const PUSH_DELAY_MS = 250;
const RETRY_DELAY_MS = 5000;
const SAVE_LINK_DELAY_MS = 800;
const PRESENCE_EVERY_MS = 60_000;

const OFFLINE_NOTE = 'No connection right now. Changes are kept on this device and sent when it is back.';

interface StoredLink {
  familyId: string;
  role: LinkRole;
  agreed: SliceJson;
}

type Connection = 'idle' | 'connecting' | 'online' | 'offline' | 'error';

const Ctx = createContext<LinkState | null>(null);

const jsonOf = (state: PersistedState, slice: SyncedSlice) => JSON.stringify(state[slice]);

/** Parses a slice that came from the server and checks its shape. Null when it cannot be used. */
function parseSlice(slice: SyncedSlice, json: string, local: PersistedState): { value: SyncedState[SyncedSlice] } | null {
  try {
    const candidate = { ...local, [slice]: JSON.parse(json) } as PersistedState;
    const result = loadState(serialiseState(candidate), local);
    if (result.fallbacks.includes(slice)) return null;
    return { value: result.state[slice] };
  } catch {
    return null;
  }
}

export function LinkProvider({ children }: { children: ReactNode }) {
  const { syncSnapshot, applyRemote, childSelf } = useStore();

  const [link, setLink] = useState<{ familyId: string; role: LinkRole } | null>(null);
  const [loaded, setLoaded] = useState(!isBackendConfigured);
  const [connection, setConnection] = useState<Connection>('idle');
  const [members, setMembers] = useState<Record<string, MemberRecord>>({});
  const [pairingCode, setPairingCode] = useState<PairingCode | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState('');

  /** Per slice: the JSON both sides last agreed on. */
  const agreed = useRef<SliceJson>({});
  const latest = useRef<PersistedState>(syncSnapshot);
  const linkRef = useRef<{ familyId: string; role: LinkRole } | null>(null);
  const deviceRef = useRef('');
  const pairingRef = useRef<PairingCode | null>(null);
  const memberCount = useRef(0);
  /** True once the first answer from the server has been handled for the current family. */
  const firstData = useRef(false);
  const pushing = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPresence = useRef(0);
  const childName = useRef(childSelf.name);
  const pushRef = useRef<() => void>(() => {});

  useEffect(() => {
    childName.current = childSelf.name;
  }, [childSelf.name]);

  // ----- storage -------------------------------------------------------------------------------

  const saveLinkSoon = useCallback(() => {
    if (saveTimer.current != null) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const current = linkRef.current;
      if (!current) return;
      const stored: StoredLink = { familyId: current.familyId, role: current.role, agreed: agreed.current };
      void writeKey(LINK_KEY, JSON.stringify(stored));
    }, SAVE_LINK_DELAY_MS);
  }, []);

  // Read this device's id and its link, once.
  useEffect(() => {
    if (!isBackendConfigured) return;
    let alive = true;
    Promise.all([readKey(DEVICE_KEY), readKey(LINK_KEY)]).then(([storedId, rawLink]) => {
      if (!alive) return;
      let id = storedId ?? '';
      if (!/^[a-z0-9]{8,32}$/.test(id)) {
        id = randomId();
        void writeKey(DEVICE_KEY, id);
      }
      deviceRef.current = id;
      setDeviceId(id);
      try {
        const parsed = rawLink ? (JSON.parse(rawLink) as Partial<StoredLink>) : null;
        if (parsed && typeof parsed.familyId === 'string' && (parsed.role === 'parent' || parsed.role === 'child')) {
          agreed.current = parsed.agreed && typeof parsed.agreed === 'object' ? parsed.agreed : {};
          linkRef.current = { familyId: parsed.familyId, role: parsed.role };
          setLink(linkRef.current);
        }
      } catch {
        // An unreadable link is treated as "not linked".
      }
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // ----- sending -------------------------------------------------------------------------------

  const schedulePush = useCallback((delay = PUSH_DELAY_MS) => {
    if (pushTimer.current != null) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      pushTimer.current = null;
      pushRef.current();
    }, delay);
  }, []);

  const push = useCallback(async () => {
    const current = linkRef.current;
    if (!current || !firstData.current) return;
    if (pushing.current) {
      schedulePush();
      return;
    }
    const state = latest.current;
    const changes = SYNCED_SLICES.map((slice) => ({ slice, base: agreed.current[slice], local: jsonOf(state, slice) })).filter(
      (c) => c.local !== c.base,
    );
    if (changes.length === 0) return;

    pushing.current = true;
    try {
      const written = await pushSlices(current.familyId, deviceRef.current, changes);
      // The link may have been dropped while the send was under way.
      if (linkRef.current?.familyId !== current.familyId) return;
      const patch: Partial<SyncedState> = {};
      for (const change of changes) {
        const merged = written[change.slice];
        if (merged === undefined) continue;
        agreed.current[change.slice] = merged;
        // The merge brought in the other side's changes. Adopt it, unless this phone changed the
        // slice again in the meantime; the next send merges that.
        if (merged !== change.local && jsonOf(latest.current, change.slice) === change.local) {
          const parsed = parseSlice(change.slice, merged, latest.current);
          if (parsed) (patch as Record<string, unknown>)[change.slice] = parsed.value;
        }
      }
      if (Object.keys(patch).length > 0) applyRemote(patch);
      setConnection('online');
      setError(null);
      setLastSyncedAt(Date.now());
      saveLinkSoon();
    } catch (e) {
      const failure = toLinkError(e);
      if (failure.code === 'network') {
        setConnection('offline');
        setError(OFFLINE_NOTE);
        schedulePush(RETRY_DELAY_MS);
      } else {
        setConnection('error');
        setError(failure.message);
      }
    } finally {
      pushing.current = false;
    }
  }, [applyRemote, saveLinkSoon, schedulePush]);

  useEffect(() => {
    pushRef.current = () => void push();
  }, [push]);

  // Whenever the shared data changes on this device, send what differs from the agreed copy.
  useEffect(() => {
    latest.current = syncSnapshot;
    if (!linkRef.current || !firstData.current) return;
    if (SYNCED_SLICES.some((slice) => jsonOf(syncSnapshot, slice) !== agreed.current[slice])) schedulePush();
  }, [syncSnapshot, schedulePush]);

  // ----- receiving -----------------------------------------------------------------------------

  const onFamilyData = useCallback(
    (snap: FamilySnapshot) => {
      if (!linkRef.current) return;
      if (!snap.exists) {
        // Nothing in the cache yet and no server: wait. From the server: the family is gone.
        if (snap.fromCache) return;
        setConnection('error');
        setError('This family no longer exists on the server. Unlink this device and pair again.');
        return;
      }

      const count = Object.keys(snap.members).length;
      // Someone used the code that was on offer: take it off the screen.
      if (count > memberCount.current && memberCount.current > 0 && pairingRef.current) {
        pairingRef.current = null;
        setPairingCode(null);
      }
      memberCount.current = count;
      setMembers(snap.members);

      const local = latest.current;
      const patch: Partial<SyncedState> = {};
      let needPush = false;
      for (const slice of SYNCED_SLICES) {
        const remoteJson = snap.state[slice];
        const localJson = jsonOf(local, slice);
        if (remoteJson === undefined) {
          needPush = true; // the server has nothing for this slice yet
          continue;
        }
        const base = agreed.current[slice];
        if (remoteJson === base) {
          if (localJson !== base) needPush = true;
          continue;
        }
        if (localJson === remoteJson) {
          agreed.current[slice] = remoteJson;
          continue;
        }
        if (base === undefined || localJson === base) {
          const parsed = parseSlice(slice, remoteJson, local);
          if (parsed) {
            (patch as Record<string, unknown>)[slice] = parsed.value;
            agreed.current[slice] = remoteJson;
          } else {
            needPush = true; // unusable on the server: repair it with this phone's copy
          }
        } else {
          needPush = true; // changed on both sides: the send merges them
        }
      }

      if (Object.keys(patch).length > 0) {
        if (patch.sosActive === true && !local.sosActive && linkRef.current.role === 'parent' && Platform.OS !== 'web') {
          Vibration.vibrate([0, 400, 200, 400]);
        }
        applyRemote(patch);
        setLastSyncedAt(Date.now());
      }
      firstData.current = true;
      setConnection(snap.fromCache ? 'offline' : 'online');
      setError(snap.fromCache ? OFFLINE_NOTE : null);
      saveLinkSoon();
      if (needPush) schedulePush();
    },
    [applyRemote, saveLinkSoon, schedulePush],
  );

  const familyId = link?.familyId ?? null;
  useEffect(() => {
    if (!familyId) return;
    firstData.current = false;
    memberCount.current = 0;
    setConnection('connecting');
    const stop = watchFamily(familyId, onFamilyData, (failure) => {
      if (failure.code === 'network') {
        setConnection('offline');
        setError(OFFLINE_NOTE);
      } else {
        setConnection('error');
        setError(failure.message);
      }
    });
    return () => {
      stop();
      if (pushTimer.current != null) {
        clearTimeout(pushTimer.current);
        pushTimer.current = null;
      }
    };
  }, [familyId, onFamilyData]);

  // Let the family know this device is around, at most once a minute.
  useEffect(() => {
    if (!familyId) return;
    const beat = () => {
      if (Date.now() - lastPresence.current < PRESENCE_EVERY_MS) return;
      lastPresence.current = Date.now();
      void touchMember(familyId, deviceRef.current);
    };
    beat();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') beat();
    });
    return () => sub.remove();
  }, [familyId]);

  // A pairing code leaves the screen when it runs out.
  useEffect(() => {
    if (!pairingCode) return;
    const wait = Math.max(0, pairingCode.expiresAt - Date.now());
    const timer = setTimeout(() => {
      pairingRef.current = null;
      setPairingCode(null);
    }, wait);
    return () => clearTimeout(timer);
  }, [pairingCode]);

  useEffect(
    () => () => {
      if (saveTimer.current != null) clearTimeout(saveTimer.current);
    },
    [],
  );

  // ----- actions -------------------------------------------------------------------------------

  const memberFor = useCallback((role: LinkRole): MemberRecord => {
    const first = childName.current.split(' ')[0] || 'Child';
    const now = Date.now();
    return {
      role,
      name: role === 'parent' ? 'Parent phone' : `${first}'s phone`,
      platform: Platform.OS,
      joinedAt: now,
      lastSeenAt: now,
    };
  }, []);

  const requireReady = useCallback(() => {
    if (!isBackendConfigured) throw new LinkError('not-configured', 'Linking is not set up in this build.');
    if (!deviceRef.current) throw new LinkError('unknown', 'Still getting ready. Try again in a moment.');
  }, []);

  const createPairingCode = useCallback(async (): Promise<PairingCode> => {
    requireReady();
    let current = linkRef.current;
    if (!current) {
      const state: SliceJson = {};
      for (const slice of SYNCED_SLICES) state[slice] = jsonOf(latest.current, slice);
      const newFamilyId = await createFamily(state, deviceRef.current, memberFor('parent'));
      agreed.current = { ...state };
      current = { familyId: newFamilyId, role: 'parent' };
      linkRef.current = current;
      setLink(current);
      await writeKey(LINK_KEY, JSON.stringify({ familyId: current.familyId, role: current.role, agreed: agreed.current } satisfies StoredLink));
    }
    const previous = pairingRef.current;
    if (previous) void removePairing(previous.code);
    const fresh = await createPairing(current.familyId);
    pairingRef.current = fresh;
    setPairingCode(fresh);
    return fresh;
  }, [memberFor, requireReady]);

  const joinWithCode = useCallback(
    async (input: string, role: LinkRole): Promise<void> => {
      requireReady();
      if (linkRef.current) throw new LinkError('already-linked', 'This device is already linked. Unlink it first.');
      const code = normalisePairingCode(input);
      if (code.length !== PAIRING_CODE_LENGTH) {
        throw new LinkError('invalid-code', `Enter the ${PAIRING_CODE_LENGTH}-character code shown on the parent's phone.`);
      }
      const newFamilyId = await redeemPairing(code);
      const family = await fetchFamily(newFamilyId);
      if (!family.exists) throw new LinkError('family-missing', 'That family could not be found. Ask for a new code.');

      // From here on this device shows the family's data.
      const patch: Partial<SyncedState> = {};
      const taken: SliceJson = {};
      for (const slice of SYNCED_SLICES) {
        const json = family.state[slice];
        if (json === undefined) continue;
        const parsed = parseSlice(slice, json, latest.current);
        if (!parsed) continue;
        (patch as Record<string, unknown>)[slice] = parsed.value;
        taken[slice] = json;
      }
      await writeMember(newFamilyId, deviceRef.current, memberFor(role));
      agreed.current = taken;
      applyRemote(patch);
      const joined = { familyId: newFamilyId, role };
      linkRef.current = joined;
      setLink(joined);
      setLastSyncedAt(Date.now());
      await writeKey(LINK_KEY, JSON.stringify({ familyId: newFamilyId, role, agreed: taken } satisfies StoredLink));
      void removePairing(code); // a code works once
    },
    [applyRemote, memberFor, requireReady],
  );

  const unlink = useCallback(async (): Promise<void> => {
    const current = linkRef.current;
    if (!current) return;
    linkRef.current = null;
    firstData.current = false;
    if (saveTimer.current != null) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const code = pairingRef.current;
    pairingRef.current = null;
    setLink(null);
    setMembers({});
    setPairingCode(null);
    setConnection('idle');
    setError(null);
    setLastSyncedAt(null);
    agreed.current = {};
    await removeKey(LINK_KEY);
    if (code) void removePairing(code.code);
    void removeMember(current.familyId, deviceRef.current);
  }, []);

  // ----- what the screens see ------------------------------------------------------------------

  const status: LinkStatus = !isBackendConfigured
    ? 'unconfigured'
    : !loaded
      ? 'connecting'
      : !link
        ? 'unlinked'
        : connection === 'online'
          ? 'linked'
          : connection === 'offline'
            ? 'offline'
            : connection === 'error'
              ? 'error'
              : 'connecting';

  const devices = useMemo<LinkedDevice[]>(
    () =>
      Object.entries(members)
        .map(([id, m]) => ({ ...m, id, isThisDevice: id === deviceId }))
        .sort((a, b) => a.joinedAt - b.joinedAt),
    [members, deviceId],
  );

  const value = useMemo<LinkState>(
    () => ({
      status,
      configured: isBackendConfigured,
      familyId,
      role: link?.role ?? null,
      devices,
      pairingCode,
      lastSyncedAt,
      error,
      createPairingCode,
      joinWithCode,
      unlink,
    }),
    [status, familyId, link, devices, pairingCode, lastSyncedAt, error, createPairingCode, joinWithCode, unlink],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLink(): LinkState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLink must be used within LinkProvider');
  return v;
}
