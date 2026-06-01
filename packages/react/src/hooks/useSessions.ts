import { useShallow } from 'zustand/react/shallow';
import { useCallback } from 'react';
import { useAcpContext } from '../context/AcpContext';
import { useAcpStore } from './useAcpStore';
import {
  createSession as coreCreateSession,
  loadSession as coreLoadSession,
  selectSession as coreSelectSession,
  closeSession as coreCloseSession,
  refreshSessions as coreRefreshSessions,
  loadMoreSessions as coreLoadMoreSessions,
  acpStore,
} from '@acp-components/core';
import type { SessionId } from '@agentclientprotocol/sdk';
import { RequestError } from '@agentclientprotocol/sdk';
import type { AcpClient, SessionMeta } from '@acp-components/core';

export function useSessions() {
  const { getClient } = useAcpContext();
  const activeSessionId = useAcpStore((s) => s.activeSessionId);
  const setActiveSession = useAcpStore((s) => s.setActiveSession);

  const sessions = useAcpStore(
    useShallow((s) => {
      const all: SessionMeta[] = [];
      for (const ws of s.workspaces.values()) {
        for (const meta of ws.sessions.values()) {
          all.push(meta);
        }
      }
      return all;
    }),
  );

  const getClientForSession = useCallback((sessionId: SessionId): AcpClient | null => {
    const state = acpStore.getState();
    for (const [, ws] of state.workspaces) {
      const meta = ws.sessions.get(sessionId);
      if (meta) return getClient(meta.agentId);
    }
    return null;
  }, [getClient]);

  const createSession = useCallback(async (agentId: string, cwd: string) => {
    const client = getClient(agentId);
    if (!client) throw new Error(`Agent ${agentId} not found`);
    try {
      return await coreCreateSession(client, agentId, cwd);
    } catch (err) {
      if (err instanceof RequestError && err.code === -32000) {
        acpStore.getState().setAuthRequired(agentId);
      }
      throw err;
    }
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

  const refreshSessions = useCallback(async (agentId: string, cwd: string) => {
    const client = getClient(agentId);
    if (!client) return;
    return coreRefreshSessions(client, agentId, cwd);
  }, [getClient]);

  const loadMoreSessions = useCallback(async (agentId: string, cwd: string) => {
    const client = getClient(agentId);
    if (!client) return;
    const cursor = acpStore.getState().workspaces.get(cwd)?.sessionListCursors.get(agentId);
    if (!cursor) return;
    return coreLoadMoreSessions(client, agentId, cwd, cursor);
  }, [getClient]);

  const sessionListCursors = useAcpStore(
    useShallow((s) => {
      const all: string[] = [];
      for (const ws of s.workspaces.values()) {
        for (const key of ws.sessionListCursors.keys()) {
          if (!all.includes(key)) all.push(key);
        }
      }
      return all;
    }),
  );

  return {
    sessions,
    activeSessionId,
    sessionListCursors,
    setActiveSession,
    selectSession,
    createSession,
    loadSession,
    closeSession,
    refreshSessions,
    loadMoreSessions,
  };
}
