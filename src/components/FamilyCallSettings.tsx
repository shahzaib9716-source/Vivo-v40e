import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { Button, Card, Text, Toggle } from '@/components/ui';
import { db } from '@/sync/remote';
import { useLink } from '@/sync/link';
import { device } from '@/sync/androidDevice';

const setting = (family: string, child: string) => doc(db(), 'families', family, 'children', child, 'settings', 'calls');
const report = (family: string, child: string, uid: string) => doc(db(), 'families', family, 'children', child, 'callStatus', uid);
const labels = {
  handset: 'Using the phone’s local call setting',
  permission: 'Choose Haven as the Android call screening app',
  blocked: 'Blocking eligible incoming non-contact calls',
  allowed: 'Allowing eligible incoming non-contact calls',
} as const;

export function SyncFamilyCallRule() {
  const { role, familyId, childId, account, status } = useLink();
  const uid = account?.uid;
  useEffect(() => {
    const native = device;
    if (!native?.applyFamilyCallRule) return;
    if (role === 'parent' || ['signed-out', 'removed', 'needs-family'].includes(status)) {
      void native.applyFamilyCallRule('', null).catch(() => {});
      return;
    }
    if (role !== 'child' || !familyId || !childId || !uid) return;
    const scope = [familyId, childId, uid].join('/');
    let active = true;
    let version = 0;
    let revision = 0;
    const refresh = () => {
      const generation = ++version;
      return onSnapshot(setting(familyId, childId), { includeMetadataChanges: true }, snapshot => {
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites || !active || version !== generation) return;
        const change = ++revision;
        const value = snapshot.get('blockNonContacts');
        void (async () => {
          const opted = await native.familyCallConsent?.(scope);
          const permissions = await native.permissionStatus?.();
          if (!active || version !== generation || change !== revision) return;
          await native.applyFamilyCallRule?.(scope, typeof value === 'boolean' ? value : null);
          const state = !opted || typeof value !== 'boolean' ? 'handset' : !permissions?.screeningRole ? 'permission' : value ? 'blocked' : 'allowed';
          if (active && version === generation && revision === change) await runTransaction(db(), async tx => {
            const ref = report(familyId, childId, uid);
            const prior = await tx.get(ref);
            if (prior.get('state') !== state) tx.set(ref, { state, at: serverTimestamp(), by: uid });
          });
        })().catch(() => {});
      }, () => { if (active) void native.applyFamilyCallRule?.('', null).catch(() => {}); });
    };
    let unsubscribe = refresh();
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') { unsubscribe(); unsubscribe = refresh(); }
    });
    const notify = subscribeConsent(() => { unsubscribe(); unsubscribe = refresh(); });
    return () => { active = false; version++; notify(); listener.remove(); unsubscribe(); };
  }, [role, familyId, childId, uid, status]);
  return null;
}

const consentListeners = new Set<() => void>();
function subscribeConsent(fn: () => void) {
  consentListeners.add(fn);
  return () => { consentListeners.delete(fn); };
}

export function HandsetCallConsent({ scope }: { scope: string }) {
  const [opted, setOpted] = useState<boolean>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void device?.familyCallConsent?.(scope).then(value => { if (active) setOpted(value); }).catch(() => setError('Unable to read call settings.'));
    return () => { active = false; };
  }, [scope]);
  if (!device?.setFamilyCallConsent) return null;
  async function change(next: boolean) {
    try {
      await device?.setFamilyCallConsent?.(scope, next);
      setOpted(next);
      setError('');
      for (const fn of consentListeners) fn();
    } catch { setError('Unable to save this choice.'); }
  }
  return <>
    <Text>Let my parent manage non-contact call blocking on this phone</Text>
    <Toggle accessibilityLabel="Use family call screening settings" value={opted === true} disabled={opted == null} onChange={change} />
    {opted && <Text>A saved family rule takes priority over the local call setting while this switch is on.</Text>}
    {error ? <Text accessibilityLiveRegion="polite">{error}</Text> : null}
  </>;
}

function PhoneStatus({ family, child, uid, name }: { family: string; child: string; uid: string; name: string }) {
  const [message, setMessage] = useState('Waiting for this phone.');
  useEffect(() => onSnapshot(report(family, child, uid), snap => {
    const state = snap.get('state') as keyof typeof labels | undefined;
    const time = snap.get('at')?.toDate?.();
    setMessage(state && labels[state] && time ? labels[state] + ' · last changed ' + time.toLocaleString() : 'Waiting for this phone.');
  }, () => setMessage('Could not read phone status.')), [family, child, uid]);
  return <Text>{name} · {message}</Text>;
}

export function ParentCallSettings({ family, child }: { family: string; child: string }) {
  const { members } = useLink();
  const [ready, setReady] = useState(false);
  const [value, setValue] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => onSnapshot(setting(family, child), snap => { setReady(true); setValue(snap.get('blockNonContacts') ?? null); }, () => setError('Unable to read call settings.')), [family, child]);
  async function save(next: boolean | null) {
    setBusy(true);
    try {
      await runTransaction(db(), async tx => { const ref = setting(family, child); if (next == null) tx.delete(ref); else tx.set(ref, { blockNonContacts: next }); });
      setError('');
    } catch { setError('Could not save this call rule. Reconnect and retry.'); }
    finally { setBusy(false); }
  }
  return <Card><Text variant="title">Incoming calls</Text>
    <Text>On the child phone, open Me, choose Haven as the Android call screening app, and enable family call settings. Android decides which numbers are eligible for screening.</Text>
    <Text>{value == null ? 'Using the phone’s local setting.' : value ? 'Family rule blocks non-contact calls.' : 'Family rule allows non-contact calls.'}</Text>
    <Button label="Block non-contact calls" disabled={!ready || busy || value === true} onPress={() => save(true)} />
    <Button label="Allow non-contact calls" variant="secondary" disabled={!ready || busy || value === false} onPress={() => save(false)} />
    {value != null && <Button label="Use the phone’s local setting" variant="ghost" disabled={busy} onPress={() => save(null)} />}
    {members.filter(member => member.role === 'child' && member.childId === child).map(member => <PhoneStatus key={member.uid} family={family} child={child} uid={member.uid} name={member.name} />)}
    {error ? <Text accessibilityLiveRegion="polite">{error}</Text> : null}
  </Card>;
}
