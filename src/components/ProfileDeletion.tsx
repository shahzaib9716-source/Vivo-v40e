import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { router } from 'expo-router';
import { Button, Text } from '@/components/ui';
import { InlineConfirm } from '@/components/RuleForm';
import { deleteProfile, finishProfileDeletion } from '@/sync/deleteProfile';
import { useLink } from '@/sync/link';
import { db } from '@/sync/remote';

const Progress = createContext('');

export function ProfileDeletionProvider({ children }: { children: ReactNode }) {
  const { role, status, familyId, account } = useLink();
  const [message, setMessage] = useState('');
  useEffect(() => {
    setMessage('');
    if (role !== 'parent' || status !== 'linked' || !familyId) return;
    const family = familyId;
    let active = true;
    let running = false;
    let jobs: string[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hadJobs = false;

    async function clean() {
      if (!active || running || !jobs.length) return;
      running = true;
      try {
        for (const child of [...jobs]) {
          if (!active) return;
          await finishProfileDeletion(db(), family, child);
        }
      } catch {
        if (active) setMessage('Cleanup was interrupted. Haven will retry while a parent is online.');
      } finally {
        running = false;
        if (active && jobs.length) {
          clearTimeout(timer);
          timer = setTimeout(clean, 15000);
        }
      }
    }

    const pending = query(collection(db(), 'families', family, 'childDeletions'), where('pending', '==', true));
    const stop = onSnapshot(pending, { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
      jobs = snapshot.docs.map(record => record.id);
      if (jobs.length) {
        hadJobs = true;
        setMessage('Removing deleted profiles’ saved data…');
        void clean();
      } else if (hadJobs) setMessage('Deleted profiles and their saved family data have been removed.');
    }, () => setMessage('Unable to check profile cleanup. Reopen Haven when connected.'));
    return () => { active = false; stop(); clearTimeout(timer); };
  }, [role, status, familyId, account?.uid]);
  return <Progress.Provider value={message}>{children}</Progress.Provider>;
}

export function ProfileDeletionStatus() {
  const message = useContext(Progress);
  return message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null;
}

export function DeleteChildProfile({ family, child, name }: { family: string; child: string; name: string }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function remove() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await deleteProfile(db(), family, child);
      router.replace('/(parent)/family');
    } catch {
      setError('Could not confirm deletion. Check the Family tab and retry if the profile is still listed.');
      setBusy(false);
    }
  }
  return <>
    {busy ? <Text accessibilityLiveRegion="polite">Removing family access…</Text>
      : confirm ? <InlineConfirm title={'Permanently delete ' + name + '’s profile?'}
        detail="All phones linked to this profile will lose family access. Haven will erase its reports, photos, saved locations, requests and conversations. Keep a parent app online to finish cleanup."
        confirmLabel="Delete profile" onCancel={() => setConfirm(false)} onConfirm={remove} />
      : <Button label="Delete child profile" variant="danger" onPress={() => setConfirm(true)} />}
    {error ? <Text tone="danger" accessibilityLiveRegion="polite">{error}</Text> : null}
  </>;
}
