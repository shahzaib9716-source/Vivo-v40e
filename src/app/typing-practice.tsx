import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import { TextField } from '@/components/RuleForm';
import { Button, Card, Header, Screen, Text } from '@/components/ui';
import { useStore } from '@/state/store';
import { useLink } from '@/sync/link';

type Preview = { text: string; timestamp: string };

export default function TypedNotes() {
  const [draft, setDraft] = useState('');
  const [preview, setPreview] = useState<Preview>();
  const submitted = useRef(false);
  const { live, sendMessage } = useStore();
  const { role, childId, familyId, account } = useLink();
  const canShare = live && role === 'child' && !!childId && !!familyId && !!account;
  const clear = useCallback(() => {
    setDraft('');
    setPreview(undefined);
    submitted.current = false;
  }, []);
  const scope = JSON.stringify([familyId, childId, account?.uid]);
  useFocusEffect(useCallback(() => {
    clear();
    const sub = AppState.addEventListener('change', state => { if (state !== 'active') clear(); });
    return () => { sub.remove(); clear(); };
  }, [clear, scope]));

  function share() {
    if (!childId || !canShare || !preview || submitted.current) return;
    submitted.current = true;
    sendMessage(childId, 'child', 'Haven Child · Typed notes · ' + preview.timestamp + '\n' + preview.text);
    router.replace('/messages');
  }

  return <Screen>
    <Header back title="Typed notes" />
    <Card>
      <Text>Write a note here and review it before sharing it in your family chat.</Text>
      <TextField accessibilityLabel="Note text" placeholder="Write a note" value={draft} multiline maxLength={280}
        autoComplete="off" importantForAutofill="no" autoCorrect={false}
        onChangeText={text => { setDraft(text); setPreview(undefined); }} />
      <Button label="Preview note" disabled={!draft.trim()} onPress={() => setPreview({ text: draft.trim(), timestamp: new Date().toISOString() })} />
    </Card>
    {preview && <Card>
      <Text variant="title">Private preview</Text>
      <Text>Haven Child · Typed notes · {preview.timestamp}</Text>
      <Text>{preview.text}</Text>
      {canShare && <Button label="Send note to family chat" onPress={share} />}
    </Card>}
    {(draft || preview) ? <Button label="Discard note" variant="ghost" onPress={clear} /> : null}
  </Screen>;
}
