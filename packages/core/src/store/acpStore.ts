import { createStore } from 'zustand/vanilla';
import type { SessionMeta, AgentConnection, WorkspaceState } from '../types';
import type { SessionId, SessionInfo } from '@agentclientprotocol/sdk';

function findWorkspaceBySession(
  workspaces: Map<string, WorkspaceState>,
  sessionId: SessionId,
): string | null {
  for (const [cwd, ws] of workspaces) {
    if (ws.sessions.has(sessionId)) return cwd;
  }
  return null;
}

function createWorkspace(cwd: string): WorkspaceState {
  return { cwd, activeSessionId: null, sessions: new Map(), sessionListCursors: new Map() };
}

interface AcpStoreState {
  agents: Map<string, AgentConnection>;
  workspaces: Map<string, WorkspaceState>;
  activeWorkspaceCwd: string | null;

  addWorkspace: (cwd: string) => void;
  removeWorkspace: (cwd: string) => void;
  setActiveWorkspace: (cwd: string) => void;

  addAgent: (agent: AgentConnection) => void;
  removeAgent: (id: string) => void;
  updateAgent: (id: string, update: Partial<AgentConnection>) => void;

  setSessions: (sessions: SessionInfo[], agentId: string, cwd: string) => void;
  appendSessions: (sessions: SessionInfo[], agentId: string, cwd: string, nextCursor: string | null) => void;
  addSession: (session: SessionMeta) => void;
  removeSession: (id: SessionId) => void;
  updateSession: (id: SessionId, update: Partial<SessionMeta>) => void;
  setActiveSession: (id: SessionId | null) => void;
}

export const acpStore = createStore<AcpStoreState>((set) => ({
  agents: new Map(),
  workspaces: new Map(),
  activeWorkspaceCwd: null,

  // --- Workspace management ---

  addWorkspace: (cwd) =>
    set((state) => {
      if (state.workspaces.has(cwd)) return state;
      const next = new Map(state.workspaces);
      next.set(cwd, createWorkspace(cwd));
      return { workspaces: next };
    }),

  removeWorkspace: (cwd) =>
    set((state) => {
      const next = new Map(state.workspaces);
      next.delete(cwd);
      if (state.activeWorkspaceCwd !== cwd) {
        return { workspaces: next };
      }
      const remaining = Array.from(next.keys());
      if (remaining.length > 0) {
        const first = remaining[0];
        return {
          workspaces: next,
          activeWorkspaceCwd: first,
        };
      }
      return {
        workspaces: next,
        activeWorkspaceCwd: null,
      };
    }),

  setActiveWorkspace: (cwd) =>
    set((state) => {
      if (state.activeWorkspaceCwd === cwd) return state;
      const next = new Map(state.workspaces);
      if (!next.has(cwd)) {
        next.set(cwd, createWorkspace(cwd));
      }
      return {
        workspaces: next,
        activeWorkspaceCwd: cwd,
      };
    }),

  // --- Agent management ---

  addAgent: (agent) =>
    set((state) => {
      const next = new Map(state.agents);
      next.set(agent.id, agent);
      return { agents: next };
    }),

  removeAgent: (id) =>
    set((state) => {
      const next = new Map(state.agents);
      next.delete(id);

      const nextWorkspaces = new Map(state.workspaces);
      for (const [cwd, ws] of state.workspaces) {
        const nextSessions = new Map(ws.sessions);
        let changed = false;
        for (const [sid, meta] of ws.sessions) {
          if (meta.agentId === id) {
            nextSessions.delete(sid);
            changed = true;
          }
        }
        if (changed) {
          let activeId = ws.activeSessionId;
          if (activeId && !nextSessions.has(activeId)) {
            activeId = null;
          }
          nextWorkspaces.set(cwd, { ...ws, sessions: nextSessions, activeSessionId: activeId });
        }
      }
      return {
        agents: next,
        workspaces: nextWorkspaces,
      };
    }),

  updateAgent: (id, update) =>
    set((state) => {
      const existing = state.agents.get(id);
      if (!existing) return state;
      const next = new Map(state.agents);
      next.set(id, { ...existing, ...update });
      return { agents: next };
    }),

  // --- Session management ---

  setSessions: (sessions, agentId, cwd) =>
    set((state) => {
      const next = new Map(state.workspaces);
      const ws = next.get(cwd);
      if (!ws) return state;
      const nextSessions = new Map(ws.sessions);
      for (const [sid, meta] of ws.sessions) {
        if (meta.agentId === agentId) nextSessions.delete(sid);
      }
      for (const s of sessions) {
        nextSessions.set(s.sessionId, {
          id: s.sessionId,
          title: s.title ?? undefined,
          cwd: s.cwd,
          updatedAt: s.updatedAt ?? undefined,
          agentId,
          loaded: false,
        });
      }
      const cursors = new Map(ws.sessionListCursors);
      cursors.delete(agentId);
      next.set(cwd, { ...ws, sessions: nextSessions, sessionListCursors: cursors });
      return { workspaces: next };
    }),

  appendSessions: (sessions, agentId, cwd, nextCursor) =>
    set((state) => {
      const next = new Map(state.workspaces);
      const ws = next.get(cwd);
      if (!ws) return state;
      const nextSessions = new Map(ws.sessions);
      for (const s of sessions) {
        nextSessions.set(s.sessionId, {
          id: s.sessionId,
          title: s.title ?? undefined,
          cwd: s.cwd,
          updatedAt: s.updatedAt ?? undefined,
          agentId,
          loaded: false,
        });
      }
      const cursors = new Map(ws.sessionListCursors);
      if (nextCursor) {
        cursors.set(agentId, nextCursor);
      } else {
        cursors.delete(agentId);
      }
      next.set(cwd, { ...ws, sessions: nextSessions, sessionListCursors: cursors });
      return { workspaces: next };
    }),

  addSession: (session) =>
    set((state) => {
      const next = new Map(state.workspaces);
      const ws = next.get(session.cwd);
      if (!ws) return state;
      const nextSessions = new Map(ws.sessions);
      nextSessions.set(session.id, session);
      next.set(session.cwd, { ...ws, sessions: nextSessions });
      return { workspaces: next };
    }),

  removeSession: (id) =>
    set((state) => {
      const cwd = findWorkspaceBySession(state.workspaces, id);
      if (!cwd) return state;
      const next = new Map(state.workspaces);
      const ws = next.get(cwd)!;
      const nextSessions = new Map(ws.sessions);
      nextSessions.delete(id);
      next.set(cwd, {
        ...ws,
        sessions: nextSessions,
        activeSessionId: ws.activeSessionId === id ? null : ws.activeSessionId,
      });
      return { workspaces: next };
    }),

  updateSession: (id, update) =>
    set((state) => {
      const cwd = findWorkspaceBySession(state.workspaces, id);
      if (!cwd) return state;
      const next = new Map(state.workspaces);
      const ws = next.get(cwd)!;
      const existing = ws.sessions.get(id);
      if (!existing) return state;
      const nextSessions = new Map(ws.sessions);
      nextSessions.set(id, { ...existing, ...update });
      next.set(cwd, { ...ws, sessions: nextSessions });
      return { workspaces: next };
    }),

  setActiveSession: (id) =>
    set((state) => {
      if (id === null) {
        if (!state.activeWorkspaceCwd) return state;
        const next = new Map(state.workspaces);
        const ws = next.get(state.activeWorkspaceCwd);
        if (!ws || ws.activeSessionId === null) return state;
        next.set(state.activeWorkspaceCwd, { ...ws, activeSessionId: null });
        return { workspaces: next };
      }
      const cwd = findWorkspaceBySession(state.workspaces, id);
      if (!cwd) return state;
      const next = new Map(state.workspaces);
      const ws = next.get(cwd);
      if (ws && ws.activeSessionId === id) return state;
      if (ws) {
        next.set(cwd, { ...ws, activeSessionId: id });
      }
      return { workspaces: next };
    }),
}));
