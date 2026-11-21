import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from './remote';

const ref = (family: string) => doc(db(), 'families', family, 'webPolicy', 'chrome');
export function setFamilySafeSearch(family: string, enabled: boolean) {
  return setDoc(ref(family), { safeSearch: enabled });
}

export function useFamilySafeSearch(family: string | null) {
  const [result, setResult] = useState<{ family: string; value?: boolean; error?: boolean }>();
  useEffect(() => {
    if (!family) return;
    return onSnapshot(ref(family), { includeMetadataChanges: true }, snapshot => {
      if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) {
        setResult({ family, value: snapshot.data()?.safeSearch === true });
      }
    }, () => setResult({ family, error: true }));
  }, [family]);
  return family && result?.family === family ? result : undefined;
}
