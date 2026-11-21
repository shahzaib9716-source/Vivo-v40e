import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import { TextField } from '@/components/RuleForm';
import { Button, Card, Header, Screen, Text } from '@/components/ui';

export default function TypingPractice() {
  const [draft, setDraft] = useState('');
  const [sample, setSample] = useState<{ text: string; at: number }>();
  const clear = useCallback(() => { setDraft(''); setSample(undefined); }, []);
  useFocusEffect(useCallback(() => {
    const sub = AppState.addEventListener('change', state => { if (state !== 'active') clear(); });
    return () => { sub.remove(); clear(); };
  }, [clear]));
  return <Screen>
    <Header back title="Typing practice" />
    <Card>
      <Text>Type a sample below and tap Preview snippet to see its text, time, and source. The sample stays on this screen and clears when you leave.</Text>
      <TextField accessibilityLabel="Practice text" placeholder="Type a sample" value={draft} multiline maxLength={280}
        autoComplete="off" importantForAutofill="no" autoCorrect={false} onChangeText={setDraft} />
      <Button label="Preview snippet" disabled={!draft.trim()} onPress={() => setSample({ text: draft, at: Date.now() })} />
    </Card>
    {sample && <Card>
      <Text variant="title">Snippet preview</Text>
      <Text>Haven · Typing practice · {new Date(sample.at).toLocaleTimeString()}</Text>
      <Text>{sample.text}</Text>
    </Card>}
    {(draft || sample) ? <Button label="Clear sample" variant="ghost" onPress={clear} /> : null}
  </Screen>;
}
