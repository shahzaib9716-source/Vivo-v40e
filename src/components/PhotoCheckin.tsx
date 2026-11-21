import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '@/sync/remote';
import { device } from '@/sync/androidDevice';
import { Button, Text } from '@/components/ui';

export function PhotoCheckin({ family, child, author }: { family: string; child: string; author?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [shared, setShared] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => {
    const ref = doc(db(), 'families', family, 'children', child, 'photos', 'latest');
    return onSnapshot(ref, snap => setShared(snap.get('jpeg') ?? null), () => {
      setShared(null); setStatus('Unable to load the shared photo.');
    });
  }, [family, child]);
  async function act(kind: 'camera' | 'send' | 'clear') {
    if (busy || !author) return;
    setBusy(true);
    setStatus('');
    try {
      if (kind === 'camera') { setDraft(await device?.takeCheckinPhoto?.() ?? null); return; }
      const ref = doc(db(), 'families', family, 'children', child, 'photos', 'latest');
      await runTransaction(db(), async tx => {
        if (kind === 'clear') tx.delete(ref);
        else if (draft) tx.set(ref, { jpeg: draft, by: author, at: serverTimestamp() });
      });
      setDraft(null);
      setStatus(kind === 'send' ? 'Photo shared.' : 'Shared photo removed.');
    } catch { setStatus('Action failed. Check your connection or camera and retry.'); }
    finally { setBusy(false); }
  }
  const picture = draft ?? shared;
  return <View style={{ gap: 8 }}>
    <Text variant="title">Photo check-in</Text>
    <Text>{draft ? 'Private preview. Tap Share to send this photo to your paired parent.' : shared ? 'Latest shared photo' : 'No photo shared.'}</Text>
    {picture && <Image accessibilityLabel={draft ? 'Private photo preview' : 'Shared photo'} resizeMode="contain" style={{ height: 180 }} source={{ uri: 'data:image/jpeg;base64,' + picture }} />}
    {author && device?.takeCheckinPhoto && <Button disabled={busy} label="Open camera" onPress={() => act('camera')} />}
    {author && draft && <>
      <Button disabled={busy} label="Share this photo" onPress={() => act('send')} />
      <Button disabled={busy} label="Discard preview" onPress={() => setDraft(null)} />
    </>}
    {author && shared && <Button disabled={busy} label="Remove shared photo" onPress={() => act('clear')} />}
    {status && <Text accessibilityLiveRegion="polite">{status}</Text>}
  </View>;
}
