import { useState, useEffect } from 'react';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from './remote';

const ref = (family: string, child: string) => doc(db(), 'families', family, 'children', child, 'settings', 'offline');
export function setOfflinePause(family: string, child: string, enabled: boolean) {
  return setDoc(ref(family, child), { enabled });
}
export function useOfflinePause(family: string | null | undefined, child: string | null | undefined) {
  const key = family && child ? family + '/' + child : '';
  const [state, setState] = useState<{ key: string; enabled?: boolean; error?: boolean }>();
  useEffect(() => {
    if (!family || !child) return;
    return onSnapshot(ref(family, child), { includeMetadataChanges: true }, snap => {
      if (!snap.metadata.hasPendingWrites && (!snap.metadata.fromCache || snap.exists())) {
        setState({ key, enabled: snap.data()?.enabled === true });
      }
    }, () => setState({ key, error: true }));
  }, [family, child, key]);
  return state?.key === key ? state : undefined;
}
