import { useStore } from 'zustand/react';
import { useMemo } from 'react';
import { sessionStore } from '@acp-components/core';
import type { SessionId, TerminalState } from '@acp-components/core';

export function useTerminals(sessionId: SessionId | null): TerminalState[] {
  const sessions = useStore(sessionStore, (s) => s.sessions);

  return useMemo(() => {
    if (!sessionId) return [];
    const data = sessions.get(sessionId);
    if (!data) return [];
    return Array.from(data.terminals.values());
  }, [sessions, sessionId]);
}
