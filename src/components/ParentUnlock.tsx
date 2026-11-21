import { useRef, useState } from 'react';
import { View } from 'react-native';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '@/sync/remote';
import { TextField } from '@/components/RuleForm';
import { Button, Card, Text } from '@/components/ui';

type Props = { family: string; child: string; parent: boolean; uid: string };

export function ParentUnlock({ family, child, parent, uid }: Props) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const lock = useRef(false);
  async function submit() {
    if (lock.current || !/^\d{5}$/.test(code)) return;
    lock.current = true;
    setBusy(true);
    setStatus('');
    const firestore = db();
    const record = doc(firestore, 'families', family, 'children', child);
    const pin = doc(record, 'unlock', 'pin');
    const attempt = doc(record, 'unlock', 'attempt');
    try {
      if (parent) {
        await runTransaction(firestore, async tx => { tx.set(pin, { code, at: serverTimestamp() }); });
        setStatus('PIN issued. Enter it on the paused child phone within ten minutes.');
      } else {
        await runTransaction(firestore, async tx => { tx.set(attempt, { by: uid, code, at: serverTimestamp() }); });
        await runTransaction(firestore, async tx => {
          tx.update(record, { bedtime: false });
          tx.delete(pin);
          tx.delete(attempt);
        });
        setStatus('Manual pause ended.');
      }
    } catch {
      setStatus(parent ? 'Could not issue the PIN. Check your connection and parent account.' : 'Unlock failed. Check the code and connection. Wait one minute before retrying.');
    } finally {
      setCode('');
      lock.current = false;
      setBusy(false);
    }
  }
  return <Card><View style={{ gap: 8 }}>
    <Text variant="title">Parent unlock PIN</Text>
    <Text>{parent ? 'Choose a five-digit code to end this child’s manual pause once. A new code replaces the previous one.' : 'Enter the one-time code from your parent. Scheduled and per-app limits still apply.'}</Text>
    <TextField value={code} editable={!busy} secureTextEntry keyboardType="number-pad" maxLength={5}
      accessibilityLabel="Five-digit unlock PIN" onChangeText={v => setCode(v.replace(/\D/g, ''))} />
    <Button label={parent ? 'Issue unlock PIN' : 'End manual pause'} disabled={busy || code.length !== 5} onPress={submit} />
    {status ? <Text accessibilityLiveRegion="polite">{status}</Text> : null}
  </View></Card>;
}
