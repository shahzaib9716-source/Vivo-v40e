import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { readKey, writeKey } from '@/state/storage';

export type AppearanceMode = 'System' | 'Light' | 'Dark';
const key = 'haven.appearance.v1';
const Context = createContext<{ preference: AppearanceMode; save: (mode: AppearanceMode) => Promise<boolean> }>({
  preference: 'System', save: async () => false,
});
export const useAppearance = () => useContext(Context);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<AppearanceMode>('System');
  const edited = useRef(false);
  const writes = useRef(Promise.resolve(true));
  useEffect(() => {
    let active = true;
    readKey(key).then(stored => {
      if (active && !edited.current && (stored === 'Light' || stored === 'Dark')) setPreference(stored);
    });
    return () => { active = false; };
  }, []);
  function save(mode: AppearanceMode) {
    edited.current = true;
    setPreference(mode);
    writes.current = writes.current.then(() => writeKey(key, mode));
    return writes.current;
  }
  return <Context.Provider value={{ preference, save }}>{children}</Context.Provider>;
}
