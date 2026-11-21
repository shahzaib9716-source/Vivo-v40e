import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp } from 'firebase/firestore';
import { Button, Card, Text } from '@/components/ui';
import { TextField } from '@/components/RuleForm';
import { db } from '@/sync/remote';
import { useLink } from '@/sync/link';
import { newId } from '@/sync/ids';
import { chatWordRef, parseWords, scanChatPage } from '@/sync/chatWords';
import { useStore } from '@/state/store';

function useWords(family: string) {
  const [setting, setSetting] = useState<{ terms: string[]; version: string | null }>();
  useEffect(() => onSnapshot(chatWordRef(db(), family), { includeMetadataChanges: true }, snap => {
    if (snap.metadata.hasPendingWrites || (snap.metadata.fromCache && !snap.exists())) return;
    const value = snap.get('terms');
    setSetting({ terms: Array.isArray(value) ? value.filter(v => typeof v === 'string') : [], version: snap.get('version') ?? null });
  }, () => setSetting(undefined)), [family]);
  return setting;
}

export function ChatWordSettings({ family, edit }: { family: string; edit?: boolean }) {
  const setting = useWords(family);
  const [draft, setDraft] = useState<{ value: string; version: string | null }>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    try {
      const terms = parseWords(draft.value);
      const version = newId('words');
      await runTransaction(db(), async tx => {
        const ref = chatWordRef(db(), family);
        const snap = await tx.get(ref);
        if ((snap.get('version') ?? null) !== draft.version) throw Error('Another parent changed the list. Discard your edits to load it.');
        tx.set(ref, { terms, version, since: serverTimestamp() });
      });
      setDraft(undefined);
      setMessage('Word alerts saved.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not save word alerts.'); }
    finally { setBusy(false); }
  }
  if (!edit) return setting?.terms.length ? <Text variant="small" tone="muted">Family word alerts in this chat: {setting.terms.join(', ')}</Text> : null;
  return <Card><Text variant="title">Haven chat word alerts</Text>
    <Text>When a parent opens Haven, Notifications shows matches in messages a child sent in Haven after the list was saved. Children can see the list in their chat.</Text>
    <TextField accessibilityLabel="Words and phrases for Haven chat alerts" placeholder="Separate words or phrases with commas" multiline
      maxLength={2430} editable={!!setting && !busy} value={draft?.value ?? setting?.terms.join(', ') ?? ''} onChangeText={value => setDraft({ value, version: draft?.version ?? setting?.version ?? null })} />
    <Button label="Save words" disabled={!draft || busy} onPress={save} />
    {draft && <Button label="Discard edits" variant="ghost" disabled={busy} onPress={() => { setDraft(undefined); setMessage(''); }} />}
    {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
  </Card>;
}

function ScanThread({ family, child, uid, version }: { family: string; child: string; uid: string; version: string }) {
  useEffect(() => {
    let active = true;
    let running = false;
    let requested = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    async function scan() {
      requested = true;
      if (running) return;
      running = true;
      try {
        while (active && requested) {
          requested = false;
          if (await scanChatPage(db(), family, child, uid)) requested = true;
        }
      } catch {
        if (active) { clearTimeout(retry); retry = setTimeout(scan, 30000); }
      } finally { running = false; }
    }
    const latest = query(collection(db(), 'families', family, 'children', child, 'messages'), orderBy('at', 'desc'), limit(1));
    const stop = onSnapshot(latest, { includeMetadataChanges: true }, snap => {
      if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites && !snap.empty) void scan();
    });
    return () => { active = false; clearTimeout(retry); stop(); };
  }, [family, child, uid, version]);
  return null;
}

function ScanFamily({ family, uid }: { family: string; uid: string }) {
  const setting = useWords(family);
  const { children } = useStore();
  return setting?.version && setting.terms.length ? <>{children.filter(child => child.id).map(child =>
    <ScanThread key={child.id} family={family} child={child.id} uid={uid} version={setting.version!} />)}</> : null;
}
export function FamilyWordAlerts() {
  const link = useLink();
  return link.status === 'linked' && link.role === 'parent' && link.account && link.familyId
    ? <ScanFamily key={link.familyId + '/' + link.account.uid} family={link.familyId} uid={link.account.uid} /> : null;
}
