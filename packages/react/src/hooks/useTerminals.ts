import { useStore } from 'zustand/react';
import { useMemo } from 'react';
import { sessionStore } from '@acp-components/core';
import type { SessionId, TerminalState } from '@acp-components/core';

export function useTerminals(sessionId: SessionId | null): TerminalState[] {
  const data = useStore(sessionStore, (s) => {
    if (!sessionId) return null;
    return s.sessions.get(sessionId) ?? null;
  });

  return useMemo(() => {
    if (!data) return [];
    return Array.from(data.terminals.values());
  }, [data]);
}
