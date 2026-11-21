import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { collection, doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { Button, Card, SegmentedControl, Text } from '@/components/ui';
import { db } from '@/sync/remote';
import { newId } from '@/sync/ids';

export type CheckinKind = 'photo' | 'screen' | 'voice';
export const requestPath = (family: string, child: string, kind: CheckinKind) => doc(db(), 'families', family, 'children', child, 'checkinRequests', kind);
interface Request { id: string; state: 'pending' | 'declined' | 'fulfilled' | 'cancelled' }
export function useCheckinRequest(family: string, child: string, kind: CheckinKind) {
  const [item, setItem] = useState<Request>();
  useEffect(() => onSnapshot(requestPath(family, child, kind), snap => setItem(snap.data() as Request | undefined), () => setItem(undefined)), [family, child, kind]);
  return item;
}
export function CheckinInbox({ family, child }: { family: string; child: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => onSnapshot(collection(db(), 'families', family, 'children', child, 'checkinRequests'), snap =>
    setCount(snap.docs.filter(d => d.get('state') === 'pending').length), () => setCount(0)), [family, child]);
  return count ? <Card>
    <Text variant="title">{count === 1 ? 'Your parent requested a check-in' : count + ' check-in requests'}</Text>
    <Button label="Review requests" onPress={() => router.navigate('/(child)/profile')} />
  </Card> : null;
}

export async function requestCheckin(family: string, child: string, kind: CheckinKind, uid: string) {
  const ref = requestPath(family, child, kind);
  const id = newId('req');
  await runTransaction(db(), async tx => {
    if ((await tx.get(ref)).get('state') === 'pending') return;
    tx.set(ref, { id, state: 'pending', by: uid, at: serverTimestamp() });
  });
}

export async function closeRequest(family: string, child: string, kind: CheckinKind, id: string, state: 'declined' | 'cancelled') {
  const ref = requestPath(family, child, kind);
  await runTransaction(db(), async tx => {
    const current = await tx.get(ref);
    if (current.get('id') === id && current.get('state') === 'pending') tx.update(ref, { state });
  });
}

export function MediaTransfer({ family }: { family: string }) {
  const [value, setValue] = useState<string>();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => onSnapshot(doc(db(), 'families', family, 'settings', 'media'), snap => {
    setValue(snap.get('wifiOnly') ? 'Wi-Fi only' : 'Wi-Fi or mobile data');
  }, () => setStatus('Unable to read media upload settings.')), [family]);
  async function save(choice: string) {
    setBusy(true);
    try {
      await runTransaction(db(), async tx => { tx.set(doc(db(), 'families', family, 'settings', 'media'), { wifiOnly: choice === 'Wi-Fi only' }); });
      setStatus('Upload setting saved.');
    } catch { setStatus('Unable to save this setting. Reconnect and retry.'); }
    finally { setBusy(false); }
  }
  return <Card><Text variant="title">Child media uploads</Text>
    <Text>Choose the connection required to start sharing a photo, screenshot or voice note from any linked child phone.</Text>
    {value && !busy && <SegmentedControl accessibilityLabel="Media upload connection" options={['Wi-Fi only', 'Wi-Fi or mobile data']} value={value} onChange={save} />}
    {status ? <Text accessibilityLiveRegion="polite">{status}</Text> : null}
  </Card>;
}
