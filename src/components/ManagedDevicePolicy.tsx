import { useEffect } from 'react';
import { useLink } from '@/sync/link';
import { useStore } from '@/state/store';
import { device, listenPolicy } from '@/sync/androidDevice';

export function ManagedDevicePolicy({ onStatus }: { onStatus: (message: string) => void }) {
  const { role, status, familyId, childId } = useLink();
  const { childSelf, live } = useStore();
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
    const unsubscribe = listenPolicy(familyId, childId, rules => {
      native.applyPolicy(JSON.stringify({ paused: bedtime, dailyMinutes: limitMin, rules }))
        .then(message => { if (current) onStatus(message); })
        .catch(() => { if (current) onStatus('Android could not apply the current rules. Check device management and usage access.'); });
    }, e => {
      if ((e as { code?: string }).code === 'permission-denied') native.clearPolicy().catch(() => {});
      if (current) onStatus('Unable to synchronize managed rules.');
    });
    return () => { current = false; unsubscribe(); };
  }, [role, status, familyId, childId, childSelf.id, bedtime, limitMin, live, onStatus]);
  return null;
}
