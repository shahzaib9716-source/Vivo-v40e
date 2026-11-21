import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from './remote';

type Setting = 'chrome' | 'adultSites';
const ref = (family: string, setting: Setting = 'chrome') => doc(db(), 'families', family, 'webPolicy', setting);
export function setFamilySafeSearch(family: string, enabled: boolean) {
  return setDoc(ref(family), { safeSearch: enabled });
}

export function setFamilyAdultSites(family: string, enabled: boolean) {
  return setDoc(ref(family, 'adultSites'), { enabled });
}

export function useFamilySafeSearch(family: string | null, setting: Setting = 'chrome') {
  const [result, setResult] = useState<{ family: string; setting: Setting; value?: boolean; error?: boolean }>();
  useEffect(() => {
    if (!family) return;
    return onSnapshot(ref(family, setting), { includeMetadataChanges: true }, snapshot => {
      if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) {
        setResult({ family, setting, value: snapshot.get(setting === 'chrome' ? 'safeSearch' : 'enabled') === true });
      }
    }, () => setResult({ family, setting, error: true }));
  }, [family, setting]);
  return family && result?.family === family && result.setting === setting ? result : undefined;
}
