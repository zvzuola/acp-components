import { createStore } from 'zustand/vanilla';
import type { ConnectionStatus, Implementation, SessionMeta } from '../types';
import type { SessionId, SessionInfo } from '@agentclientprotocol/sdk';

interface AcpStoreState {
  connectionStatus: ConnectionStatus;
  agentInfo: Implementation | null;
  capabilities: Record<string, unknown> | null;
  sessions: Map<SessionId, SessionMeta>;
  activeSessionId: SessionId | null;
  projectCwd: string;

  setConnectionStatus: (status: ConnectionStatus) => void;
  setAgentInfo: (info: Implementation | null) => void;
  setCapabilities: (caps: Record<string, unknown> | null) => void;
  setSessions: (sessions: SessionInfo[]) => void;
  addSession: (session: SessionMeta) => void;
  removeSession: (id: SessionId) => void;
  updateSession: (id: SessionId, update: Partial<SessionMeta>) => void;
  setActiveSession: (id: SessionId | null) => void;
  setProjectCwd: (cwd: string) => void;
}

export const acpStore = createStore<AcpStoreState>((set) => ({
  connectionStatus: 'disconnected',
  agentInfo: null,
  capabilities: null,
  sessions: new Map(),
  activeSessionId: null,
  projectCwd: '',

  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setAgentInfo: (info) => set({ agentInfo: info }),
  setCapabilities: (caps) => set({ capabilities: caps }),

  setSessions: (sessions) => {
    const map = new Map<SessionId, SessionMeta>();
    for (const s of sessions) {
      map.set(s.sessionId, { id: s.sessionId, title: s.title ?? undefined, cwd: s.cwd, updatedAt: s.updatedAt ?? undefined });
    }
    set({ sessions: map });
  },

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
