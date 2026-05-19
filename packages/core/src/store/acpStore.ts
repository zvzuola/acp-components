import { createStore } from 'zustand/vanilla';
import type { SessionMeta, AgentConnection } from '../types';
import type { SessionId, SessionInfo } from '@agentclientprotocol/sdk';

interface AcpStoreState {
  agents: Map<string, AgentConnection>;
  sessions: Map<SessionId, SessionMeta>;
  activeSessionId: SessionId | null;
  projectCwd: string;

  addAgent: (agent: AgentConnection) => void;
  removeAgent: (id: string) => void;
  updateAgent: (id: string, update: Partial<AgentConnection>) => void;
  setSessions: (sessions: SessionInfo[], agentId: string) => void;
  addSession: (session: SessionMeta) => void;
  removeSession: (id: SessionId) => void;
  updateSession: (id: SessionId, update: Partial<SessionMeta>) => void;
  setActiveSession: (id: SessionId | null) => void;
  setProjectCwd: (cwd: string) => void;
}

export const acpStore = createStore<AcpStoreState>((set) => ({
  agents: new Map(),
  sessions: new Map(),
  activeSessionId: null,
  projectCwd: '',

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
      // Also remove sessions belonging to this agent
      const nextSessions = new Map(state.sessions);
      for (const [sid, meta] of state.sessions) {
        if (meta.agentId === id) nextSessions.delete(sid);
      }
      return {
        agents: next,
        sessions: nextSessions,
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

  setSessions: (sessions, agentId) =>
    set((state) => {
      const next = new Map(state.sessions);
      // Remove old sessions for this agentId, then merge in the new list
      for (const [sid, meta] of state.sessions) {
        if (meta.agentId === agentId) next.delete(sid);
      }
      for (const s of sessions) {
        next.set(s.sessionId, {
          id: s.sessionId,
          title: s.title ?? undefined,
          cwd: s.cwd,
          updatedAt: s.updatedAt ?? undefined,
          agentId,
          loaded: false,
        });
      }
      return { sessions: next };
    }),

  addSession: (session) =>
    set((state) => {
      const next = new Map(state.sessions);
      next.set(session.id, session);
      return { sessions: next };
    }),

  removeSession: (id) =>
    set((state) => {
      const next = new Map(state.sessions);
      next.delete(id);
      return {
        sessions: next,
        activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
      };
    }),

  updateSession: (id, update) =>
    set((state) => {
      const existing = state.sessions.get(id);
      if (!existing) return state;
      const next = new Map(state.sessions);
      next.set(id, { ...existing, ...update });
      return { sessions: next };
    }),

  setActiveSession: (id) => set({ activeSessionId: id }),
  setProjectCwd: (cwd) => set({ projectCwd: cwd }),
}));
