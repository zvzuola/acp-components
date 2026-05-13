import { useCallback } from 'react';
import { useAcpContext } from '../context/AcpContext';
import { useAcpStore } from './useAcpStore';
import {
  createSession as coreCreateSession,
  loadSession as coreLoadSession,
  selectSession as coreSelectSession,
  closeSession as coreCloseSession,
  refreshSessions as coreRefreshSessions,
} from '@acp-components/core';
import type { SessionId } from '@agentclientprotocol/sdk';

export function useSessions() {
  const { client } = useAcpContext();
  const sessions = useAcpStore((s) => s.sessions);
  const activeSessionId = useAcpStore((s) => s.activeSessionId);
  const setActiveSession = useAcpStore((s) => s.setActiveSession);

  const createSession = useCallback(async (cwd?: string) => {
    return coreCreateSession(client, cwd);
  }, [client]);

  const loadSession = useCallback(async (sessionId: SessionId, cwd: string) => {
    return coreLoadSession(client, sessionId, cwd);
  }, [client]);

  const selectSession = useCallback(async (sessionId: SessionId) => {
    return coreSelectSession(client, sessionId);
  }, [client]);

  const closeSession = useCallback(async (sessionId: SessionId) => {
    return coreCloseSession(client, sessionId);
  }, [client]);

  const refreshSessions = useCallback(async (cwd?: string) => {
    return coreRefreshSessions(client, cwd);
  }, [client]);

  return {
    sessions: Array.from(sessions.values()),
    activeSessionId,
    setActiveSession,
    selectSession,
    createSession,
    loadSession,
    closeSession,
    refreshSessions,
  };
}
