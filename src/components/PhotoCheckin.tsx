import { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { closeRequest, requestCheckin, requestPath, useCheckinRequest } from './CheckinRequests';
import { useLink } from '@/sync/link';
import { db } from '@/sync/remote';
import { device } from '@/sync/androidDevice';
import { Button, Text } from '@/components/ui';

type Kind = 'photo' | 'screen' | 'voice';
const media = {
  photo: { path: ['photos', 'latest'], field: 'jpeg', title: 'Photo check-in', label: 'photo', select: 'Open front or back camera', take: () => device?.takeCheckinPhoto?.() },
  screen: { path: ['photos', 'screen'], field: 'jpeg', title: 'Screenshot check-in', label: 'screenshot', select: 'Choose a screenshot', take: () => device?.chooseCheckinImage?.() },
  voice: { path: ['voice', 'latest'], field: 'audio', title: 'Voice check-in', label: 'voice note', select: 'Record a voice note', take: () => device?.recordVoiceNote?.() },
} as const;

export function FamilyCheckins({ family, child, author }: { family: string; child: string; author?: string }) {
  return <>{(['photo', 'screen', 'voice'] as const).map(kind =>
    <Checkin key={[family, child, author, kind].join('/')} family={family} child={child} author={author} kind={kind} />
  )}</>;
}

function Checkin({ family, child, author, kind }: { family: string; child: string; author?: string; kind: Kind }) {
  const spec = media[kind];
  const link = useLink();
  const request = useCheckinRequest(family, child, kind);
  const [draft, setDraft] = useState<string | null>(null);
  const [shared, setShared] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const lock = useRef(false);
  useEffect(() => {
    const ref = doc(db(), 'families', family, 'children', child, ...spec.path);
    return onSnapshot(ref, snap => setShared(snap.get(spec.field) ?? null), () => {
      setShared(null); setStatus('Unable to load this check-in.');
    });
  }, [family, child, spec]);

  async function act(action: 'select' | 'send' | 'clear' | 'play' | 'request' | 'cancel' | 'decline') {
    if (lock.current) return;
    if (!author && (action === 'select' || action === 'send' || action === 'clear' || action === 'decline')) return;
    lock.current = true;
    setBusy(true);
    setStatus('');
    try {
      if (action === 'request' && link.role === 'parent' && link.account) {
        await requestCheckin(family, child, kind, link.account.uid);
      } else if (action === 'cancel' || action === 'decline') {
        if (request) await closeRequest(family, child, kind, request.id, action === 'cancel' ? 'cancelled' : 'declined');
      } else if (action === 'select') {
        const picked = await spec.take();
        if (picked === undefined) throw Error('Install the updated Android app to use this feature.');
        if (picked) setDraft(picked);
      } else if (action === 'play') {
        if (device?.playVoiceNote && (draft || shared)) await device.playVoiceNote((draft ?? shared)!);
      } else {
        const ref = doc(db(), 'families', family, 'children', child, ...spec.path);
        await runTransaction(db(), async tx => {
          if (action === 'clear') { tx.delete(ref); return; }
          if (!draft || action !== 'send') return;
          const transfer = await tx.get(doc(db(), 'families', family, 'settings', 'media'));
          if (transfer.get('wifiOnly') && !await device?.usingWifi?.()) throw Error('Connect to Wi-Fi to send this check-in. Your preview is still here.');
          const pending = requestPath(family, child, kind);
          const latest = await tx.get(pending);
          if (request?.state === 'pending' && latest.get('state') === 'pending' && latest.get('id') === request.id) {
            tx.update(pending, { state: 'fulfilled' });
          }
          tx.set(ref, { [spec.field]: draft, by: author, at: serverTimestamp() });
        });
        setDraft(null);
        setStatus(action === 'send' ? 'Shared with your paired parent.' : 'Shared check-in removed.');
      }
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Unable to complete this action. Try again.'); }
    finally { lock.current = false; setBusy(false); }
  }

  const item = draft ?? shared;
  return <View style={{ gap: 8, marginVertical: 8 }}>
    <Text variant="title">{spec.title}</Text>
    <Text>{draft ? 'Private preview. Share when ready.' : shared ? 'Latest shared ' + spec.label : 'No ' + spec.label + ' shared.'}</Text>
    {author && request?.state === 'pending' && <>
      <Text>Your parent requested a {spec.label}. You can share one or decline.</Text>
      <Button label="Decline request" disabled={busy} variant="ghost" onPress={() => act('decline')} />
    </>}
    {!author && link.role === 'parent' && <>
      {request && <Text>Request {request.state}.</Text>}
      {request?.state === 'pending' ? <Button label="Cancel request" disabled={busy} variant="ghost" onPress={() => act('cancel')} />
        : <Button label={'Request a ' + spec.label} disabled={busy} variant="secondary" onPress={() => act('request')} />}
    </>}
    {item && kind !== 'voice' && <Image accessibilityLabel={spec.title} resizeMode="contain" style={{ height: kind === 'screen' ? 320 : 180 }} source={{ uri: 'data:image/jpeg;base64,' + item }} />}
    {item && kind === 'voice' && (device?.playVoiceNote
      ? <Button disabled={busy} label="Listen to note" onPress={() => act('play')} />
      : <Text>Open this note in the Haven Android app to listen.</Text>)}
    {author && kind === 'screen' && <Text>Take a screenshot using your phone’s screenshot controls, then choose it here to preview.</Text>}
    {author && device && <Button disabled={busy} label={spec.select} onPress={() => act('select')} />}
    {author && draft && <>
      <Button disabled={busy} label={'Share this ' + spec.label} onPress={() => act('send')} />
      <Button disabled={busy} label="Discard preview" onPress={() => setDraft(null)} />
    </>}
    {author && shared && <Button disabled={busy} label={'Remove shared ' + spec.label} onPress={() => act('clear')} />}
    {status ? <Text accessibilityLiveRegion="polite">{status}</Text> : null}
  </View>;
}
