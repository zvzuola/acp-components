import { useCallback } from 'react';
import { useAcpContext } from '../context/AcpContext';
import { useAcpStore } from '../store/acpStore';
import { useSessionStore } from '../store/sessionStore';
import type { SessionId } from '@agentclientprotocol/sdk';

export function useSessions() {
  const { client } = useAcpContext();
  const sessions = useAcpStore((s) => s.sessions);
  const activeSessionId = useAcpStore((s) => s.activeSessionId);
  const setActiveSession = useAcpStore((s) => s.setActiveSession);
  const setSessions = useAcpStore((s) => s.setSessions);
  const addSession = useAcpStore((s) => s.addSession);
  const removeSession = useAcpStore((s) => s.removeSession);
  const ensureSession = useSessionStore((s) => s.ensureSession);
  const removeSessionData = useSessionStore((s) => s.removeSession);

  const createSession = useCallback(async (cwd?: string) => {
    const cwdToUse = cwd ?? useAcpStore.getState().projectCwd;
    const res = await client.newSession(cwdToUse);
    const meta = { id: res.sessionId, cwd: cwdToUse };
    addSession(meta);
    ensureSession(res.sessionId);
    if (res.configOptions) {
      useSessionStore.getState().setConfigOptions(res.sessionId, res.configOptions);
    }
    return res.sessionId;
  }, [client, addSession, ensureSession]);

  const loadSession = useCallback(async (sessionId: SessionId, cwd: string) => {
    useSessionStore.getState().resetSession(sessionId);
    const res = await client.loadSession(sessionId, cwd);
    if (res.configOptions) {
      useSessionStore.getState().setConfigOptions(sessionId, res.configOptions);
    }
  }, [client]);

  const selectSession = useCallback(async (sessionId: SessionId) => {
    const meta = useAcpStore.getState().sessions.get(sessionId);
    if (!meta) return;
    setActiveSession(sessionId);
    try {
      await loadSession(sessionId, meta.cwd);
    } catch {
      // loadSession optional — agent may not support it
    }
  }, [setActiveSession, loadSession]);

  const closeSession = useCallback(async (sessionId: SessionId) => {
    await client.closeSession(sessionId);
    removeSession(sessionId);
    removeSessionData(sessionId);
  }, [client, removeSession, removeSessionData]);

  const refreshSessions = useCallback(async (cwd?: string) => {
    const res = await client.listSessions(undefined, cwd);
    setSessions(res.sessions);
  }, [client, setSessions]);

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
