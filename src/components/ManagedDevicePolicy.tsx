import { useEffect } from 'react';
import { parseClock } from './ScheduleFace';
import { publishManagement } from '@/sync/managementReport';
import { useLink } from '@/sync/link';
import { useStore } from '@/state/store';
import { device, listenPolicy } from '@/sync/androidDevice';

import { useFamilySafeSearch } from '@/sync/safeSearch';

export function ManagedDevicePolicy({ onStatus }: { onStatus: (message: string) => void }) {
  const { role, status, familyId, childId, account } = useLink();
  const { childSelf, live, schedules, sites } = useStore();
  const search = useFamilySafeSearch(live && role === 'child' && familyId ? familyId : null)?.value;
  const { bedtime, limitMin } = childSelf;
  useEffect(() => {
    const native = device;
    if (!native) return;
    if (['signed-out', 'needs-family', 'removed'].includes(status) || role === 'parent') {
      native.clearPolicy().catch(() => onStatus('Open Haven again to release managed rules.'));
      return;
    }
    if (!live || role !== 'child' || !familyId || childId !== childSelf.id || !childId) return;
    let current = true;
    function report(message: string) {
      if (!current || !account || !familyId || !childId) return;
      onStatus(message);
      publishManagement(familyId, childId, account.uid, message.slice(0, 240)).catch(() => {
        if (current) onStatus(message + ' Status could not be sent to your parent.');
      });
    }
    const unsubscribe = listenPolicy(familyId, childId, rules => {
      const windows = schedules.flatMap(s => {
        const start = parseClock(s.start);
        const end = parseClock(s.end);
        if (!s.on || start == null || end == null || start === end) return [];
        const mask = s.days.reduce((bits, selected, day) => selected ? bits | (1 << day) : bits, 0);
        return [{ start, end, mask }];
      });
      native.applyPolicy(JSON.stringify({ paused: bedtime, dailyMinutes: limitMin, rules, windows, safeSearch: search, sites: sites.map(({ host, list }) => ({ host, list })) }))
        .then(report)
        .catch(() => report('Android could not apply the current rules. Check device management and usage access.'));
    }, e => {
      if ((e as { code?: string }).code === 'permission-denied') native.clearPolicy().catch(() => {});
      if (current) onStatus('Unable to synchronize managed rules.');
    });
    return () => { current = false; unsubscribe(); };
  }, [role, status, familyId, childId, account, childSelf.id, bedtime, limitMin, schedules, sites, search, live, onStatus]);
  return null;
}
