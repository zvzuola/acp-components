import { createStore } from 'zustand/vanilla';
import type { SessionMeta, AgentConnection, WorkspaceState } from '../types';
import type { SessionId, SessionInfo } from '@agentclientprotocol/sdk';
import { sessionStore } from './sessionStore';

interface PendingAuth {
  agentId: string;
}

export function findWorkspaceBySession(
  workspaces: Map<string, WorkspaceState>,
  sessionId: SessionId,
): string | null {
  for (const [cwd, ws] of workspaces) {
    if (ws.sessions.has(sessionId)) return cwd;
  }
  return null;
}

function createWorkspace(cwd: string): WorkspaceState {
  return { cwd, sessions: new Map(), sessionListCursors: new Map() };
}

interface AcpStoreState {
  agents: Map<string, AgentConnection>;
  workspaces: Map<string, WorkspaceState>;
  activeSessionId: SessionId | null;
  pendingAuth: PendingAuth | null;

  addWorkspace: (cwd: string) => void;
  removeWorkspace: (cwd: string) => void;

  addAgent: (agent: AgentConnection) => void;
  removeAgent: (id: string) => void;
  updateAgent: (id: string, update: Partial<AgentConnection>) => void;

  setSessions: (sessions: SessionInfo[], agentId: string, cwd: string) => void;
  appendSessions: (sessions: SessionInfo[], agentId: string, cwd: string, nextCursor: string | null) => void;
  addSession: (session: SessionMeta) => void;
  removeSession: (id: SessionId) => void;
  updateSession: (id: SessionId, update: Partial<SessionMeta>) => void;
  setActiveSession: (id: SessionId | null) => void;

  setAuthRequired: (agentId: string) => void;
  clearAuthRequired: () => void;
}

export const acpStore = createStore<AcpStoreState>((set) => ({
  agents: new Map(),
  workspaces: new Map(),
  activeSessionId: null,
  pendingAuth: null,

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
      const ws = state.workspaces.get(cwd);
      if (!ws) return state;

      // If the global active session belongs to this workspace, clear it
      let activeSessionId = state.activeSessionId;
      if (activeSessionId && ws.sessions.has(activeSessionId)) {
        activeSessionId = null;
      }

      const next = new Map(state.workspaces);
      next.delete(cwd);

      if (activeSessionId !== state.activeSessionId) {
        return { workspaces: next, activeSessionId: null };
      }
      return { workspaces: next };
    }),

  // --- Agent management ---

  addAgent: (agent) =>
    set((state) => {
      const next = new Map(state.agents);
      next.set(agent.id, agent);
      return { agents: next };
    }),

  removeAgent: (id) => {
    // Snapshot the sessions owned by this agent before mutating, so their
    // message cache in `sessionStore` can be dropped AFTER the `set` (the
    // reducer must stay pure — no cross-store writes inside it). Without this,
    // messages/plan/tool-calls survive as orphans once the agent and its
    // session meta are gone. Mirrors the per-session cleanup in
    // `deleteSession`/`closeSession` (acpStore + sessionStore).
    const orphanedSessionIds: SessionId[] = [];
    for (const [, ws] of acpStore.getState().workspaces) {
      for (const [sid, meta] of ws.sessions) {
        if (meta.agentId === id) orphanedSessionIds.push(sid);
      }
    }

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
          nextWorkspaces.set(cwd, { ...ws, sessions: nextSessions });
        }
      }

      // If the global active session was removed, clear it
      let activeSessionId = state.activeSessionId;
      if (activeSessionId) {
        let found = false;
        for (const [, ws] of nextWorkspaces) {
          if (ws.sessions.has(activeSessionId)) {
            found = true;
            break;
          }
        }
        if (!found) activeSessionId = null;
      }

      return {
        agents: next,
        workspaces: nextWorkspaces,
        ...(activeSessionId !== state.activeSessionId ? { activeSessionId: null } : {}),
      };
    });

    // Drop the orphaned sessions' message caches now that the meta is gone.
    for (const sid of orphanedSessionIds) {
      sessionStore.getState().removeSession(sid);
    }
  },

  updateAgent: (id, update) =>
    set((state) => {
      const existing = state.agents.get(id);
      if (!existing) return state;
      const next = new Map(state.agents);
      next.set(id, { ...existing, ...update });
      return { agents: next };
    }),

  // --- Session management ---

  setSessions: (sessions, agentId, cwd) => {
    // Snapshot the sessions being DROPPED by this replace (i.e. owned by this
    // agent but absent from the new list) BEFORE mutating, so their message
    // cache in `sessionStore` can be dropped AFTER the `set` (the reducer must
    // stay pure — no cross-store writes inside it). Sessions that survive the
    // replace (same id reappears in `sessions`) keep their cache — only truly
    // removed ids are pruned. Mirrors the per-session cleanup in `removeAgent`.
    const droppedSessionIds: SessionId[] = [];
    const wsBefore = acpStore.getState().workspaces.get(cwd);
    if (wsBefore) {
      const survivorIds = new Set(sessions.map((s) => s.sessionId));
      for (const [sid, meta] of wsBefore.sessions) {
        if (meta.agentId === agentId && !survivorIds.has(sid)) {
          droppedSessionIds.push(sid);
        }
      }
    }

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
    });

    // Drop the truly-removed sessions' message caches now that the meta is gone.
    for (const sid of droppedSessionIds) {
      sessionStore.getState().removeSession(sid);
    }
  },

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
      next.set(cwd, { ...ws, sessions: nextSessions });

      if (state.activeSessionId === id) {
        return { workspaces: next, activeSessionId: null };
      }
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
      if (state.activeSessionId === id) return state;

      if (id === null) {
        return { activeSessionId: null };
      }

      // Validate session exists in some workspace
      const cwd = findWorkspaceBySession(state.workspaces, id);
      if (!cwd) return state;

      return { activeSessionId: id };
    }),

  setAuthRequired: (agentId) => set({ pendingAuth: { agentId } }),
  clearAuthRequired: () => set({ pendingAuth: null }),
}));
