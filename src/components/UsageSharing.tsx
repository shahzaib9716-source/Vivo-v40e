import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { refreshUsage } from '@/sync/usageRefresh';
import { device, shareUsage } from '@/sync/androidDevice';
import { useLink } from '@/sync/link';
import { readKey, writeKey } from '@/state/storage';

interface Consent {
  enabled: boolean;
  ready: boolean;
  status: string;
  setEnabled: (value: boolean) => Promise<void>;
}

const Context = createContext<Consent | null>(null);
export const useUsageSharing = () => useContext(Context);

export function UsageSharingProvider({ children }: { children: ReactNode }) {
  const { role, familyId, childId, account, status: linkStatus } = useLink();
  const uid = account?.uid;
  const key = role === 'child' && familyId && childId && uid && device
    ? ['haven.usage-consent.v1', familyId, childId, uid].join('/') : '';
  const [preference, setPreference] = useState({ key: '', enabled: false });
  const [status, setStatus] = useState('');
  const scope = useRef('');
  const generation = useRef(0);
  const pending = useRef<Promise<void> | null>(null);
  const enabled = Boolean(key && preference.key === key && preference.enabled);

  useEffect(() => {
    let current = true;
    scope.current = key;
    if (key) readKey(key).then(value => {
      if (current) { setPreference({ key, enabled: value === 'on' }); setStatus(''); }
    });
    return () => { current = false; scope.current = ''; };
  }, [key]);

  const setEnabled = useCallback(async (value: boolean) => {
    if (!key) throw Error('Pair this child device first.');
    generation.current++;
    if (!value) setPreference({ key, enabled: false });
    const saved = await writeKey(key, value ? 'on' : 'off');
    if (!saved) throw Error('Could not save the sharing setting on this phone. Please retry.');
    if (!value) await pending.current;
    if (scope.current !== key) return;
    setPreference({ key, enabled: value });
    setStatus(value ? 'Automatic usage sharing enabled.' : 'Automatic usage sharing off.');
  }, [key]);

  useEffect(() => {
    if (!enabled || linkStatus !== 'linked' || !familyId || !childId || !uid || !device) return;
    const native = device;
    const family = familyId;
    const child = childId;
    const author = uid;
    const token = generation.current;
    let disposed = false;
    let lastAttempt = 0;
    const active = () => !disposed && token === generation.current && AppState.currentState === 'active';
    function refresh() {
      if (!active() || pending.current || Date.now() - lastAttempt < 60000) return;
      lastAttempt = Date.now();
      const work = (async () => {
        try {
          const published = await refreshUsage(active, () => native.readUsage(), report =>
            shareUsage(family, child, author, report.apps, report.measuredAt, report.screenMs, report.days));
          if (published && active()) setStatus('Last usage update: ' + new Date().toLocaleString());
        } catch (error) {
          if (active()) setStatus(error instanceof Error ? error.message : 'Usage update failed. Check Usage access and connectivity.');
        }
      })();
      pending.current = work;
      void work.finally(() => { if (pending.current === work) pending.current = null; });
    }
    refresh();
    const sub = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    const timer = setInterval(refresh, 15 * 60000);
    return () => { disposed = true; sub.remove(); clearInterval(timer); };
  }, [enabled, linkStatus, familyId, childId, uid]);

  return <Context.Provider value={{ enabled, ready: !!key && preference.key === key, status, setEnabled }}>{children}</Context.Provider>;
}
