import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { Avatar, Button, Text } from '@/components/ui';
import { db } from '@/sync/remote';
import { device } from '@/sync/androidDevice';

export function ProfilePicture({ family, child, name, size, edit }: { family: string; child: string; name: string; size: number; edit?: boolean }) {
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => {
    const ref = doc(db(), 'families', family, 'children', child, 'photos', 'avatar');
    return onSnapshot(ref, snap => setSaved(snap.get('jpeg') ?? null), () => { setSaved(null); setStatus('Could not load the profile picture.'); });
  }, [family, child]);
  async function change(action: 'select' | 'save' | 'remove') {
    if (busy || !edit) return;
    setBusy(true);
    setStatus('');
    try {
      if (action === 'select') {
        const photo = await device?.chooseCheckinImage?.();
        if (photo) setDraft(photo);
      } else {
        const ref = doc(db(), 'families', family, 'children', child, 'photos', 'avatar');
        await runTransaction(db(), async tx => {
          if (action === 'remove') tx.delete(ref);
          else if (draft) tx.set(ref, { jpeg: draft });
        });
        setDraft(null);
      }
    } catch { setStatus('Could not update the profile picture. Please retry.'); }
    finally { setBusy(false); }
  }
  const photo = draft ?? saved;
  return <View style={{ alignItems: 'center', gap: 4 }}>
    {photo ? <Image accessibilityLabel={name + ' profile picture'} style={{ width: size, height: size, borderRadius: size / 2 }} source={{ uri: 'data:image/jpeg;base64,' + photo }} /> : <Avatar name={name} size={size} />}
    {edit && device?.chooseCheckinImage && <Button label="Choose profile picture" variant="ghost" size="sm" disabled={busy} onPress={() => change('select')} />}
    {edit && draft && <>
      <Button label="Save picture" disabled={busy} onPress={() => change('save')} />
      <Button label="Discard" variant="ghost" disabled={busy} onPress={() => setDraft(null)} />
    </>}
    {edit && saved && <Button label="Remove picture" variant="ghost" size="sm" disabled={busy} onPress={() => change('remove')} />}
    {edit && status ? <Text accessibilityLiveRegion="polite">{status}</Text> : null}
  </View>;
}
