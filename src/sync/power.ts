import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from './remote';

const ref = (family: string, child: string) => doc(db(), 'families', family, 'children', child, 'settings', 'power');
export function saveThreshold(family: string, child: string, percent: number) {
  return setDoc(ref(family, child), { percent });
}

export function usePowerThreshold(family?: string | null, child?: string | null) {
  const key = family && child ? family + '/' + child : '';
  const [state, setState] = useState<{ key: string; percent?: number; error?: boolean }>();
  useEffect(() => {
    if (!family || !child) return;
    return onSnapshot(ref(family, child), { includeMetadataChanges: true }, snap => {
      if (snap.metadata.hasPendingWrites || (snap.metadata.fromCache && !snap.exists())) return;
      const percent = snap.data()?.percent ?? 0;
      setState({ key, percent });
    }, () => setState({ key, error: true }));
  }, [key, family, child]);
  return state?.key === key ? state : undefined;
}

export async function lowBattery(threshold: number, read?: () => Promise<number>) {
  if (!threshold || !read) return false;
  const level = await read();
  return level >= 0 && level < threshold;
}
