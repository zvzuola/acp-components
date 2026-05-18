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
import type { AcpClient } from '@acp-components/core';

export function useSessions() {
  const { getClient } = useAcpContext();
  const sessions = useAcpStore((s) => s.sessions);
  const activeSessionId = useAcpStore((s) => s.activeSessionId);
  const setActiveSession = useAcpStore((s) => s.setActiveSession);

  const getClientForSession = useCallback((sessionId: SessionId): AcpClient | null => {
    const agentId = sessions.get(sessionId)?.agentId;
    if (!agentId) return null;
    return getClient(agentId);
  }, [sessions, getClient]);

  const createSession = useCallback(async (agentId: string, cwd?: string) => {
    const client = getClient(agentId);
    if (!client) throw new Error(`Agent ${agentId} not found`);
    return coreCreateSession(client, agentId, cwd);
  }, [getClient]);

  const loadSession = useCallback(async (sessionId: SessionId, cwd: string) => {
    const client = getClientForSession(sessionId);
    if (!client) throw new Error('No client for session');
    return coreLoadSession(client, sessionId, cwd);
  }, [getClientForSession]);

  const selectSession = useCallback(async (sessionId: SessionId) => {
    const client = getClientForSession(sessionId);
    if (!client) return;
    return coreSelectSession(client, sessionId);
  }, [getClientForSession]);

  const closeSession = useCallback(async (sessionId: SessionId) => {
    const client = getClientForSession(sessionId);
    if (!client) return;
    return coreCloseSession(client, sessionId);
  }, [getClientForSession]);

  const refreshSessions = useCallback(async (agentId: string, cwd?: string) => {
    const client = getClient(agentId);
    if (!client) return;
    return coreRefreshSessions(client, agentId, cwd);
  }, [getClient]);

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
