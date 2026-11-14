import { createContext, ReactNode, useContext, useMemo } from 'react';

import { isBackendConfigured } from './config';
import { LinkError, type LinkState } from './types';

/**
 * PLACEHOLDER. This provider only reports whether the build is configured; the real one keeps
 * the same LinkState contract (src/sync/types.ts) and talks to Firestore.
 */
const Ctx = createContext<LinkState | null>(null);

const unavailable = async (): Promise<never> => {
  throw new LinkError('not-configured', 'Linking is not set up in this build.');
};

export function LinkProvider({ children }: { children: ReactNode }) {
  const value = useMemo<LinkState>(
    () => ({
      status: isBackendConfigured ? 'unlinked' : 'unconfigured',
      configured: isBackendConfigured,
      familyId: null,
      role: null,
      devices: [],
      pairingCode: null,
      lastSyncedAt: null,
      error: null,
      createPairingCode: unavailable,
      joinWithCode: unavailable,
      unlink: async () => {},
    }),
    [],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLink(): LinkState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLink must be used within LinkProvider');
  return v;
}
