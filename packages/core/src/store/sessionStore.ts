import { create } from 'zustand';
import type { Message, ToolCallState, PermissionRequest } from '../types';
import type { SessionId, ContentBlock, StopReason, PlanEntry, UsageUpdate, SessionConfigOption } from '@agentclientprotocol/sdk';

interface SessionData {
  messages: Message[];
  isStreaming: boolean;
  pendingToolCalls: Map<string, ToolCallState>;
  stopReason: StopReason | null;
  pendingPermissions: PermissionRequest[];
  plan: PlanEntry[];
  usage: UsageUpdate | null;
  configOptions: SessionConfigOption[];
}

interface SessionStoreState {
  sessions: Map<SessionId, SessionData>;

  ensureSession: (id: SessionId) => void;
  removeSession: (id: SessionId) => void;
  resetSession: (id: SessionId) => void;

  addMessage: (sessionId: SessionId, msg: Message) => void;
  updateMessage: (sessionId: SessionId, id: string, update: Partial<Message>) => void;
  appendContent: (sessionId: SessionId, messageId: string, role: Message['role'], block: ContentBlock) => void;
  appendThought: (sessionId: SessionId, messageId: string, role: Message['role'], block: ContentBlock) => void;
  setIsStreaming: (sessionId: SessionId, v: boolean) => void;
  setStopReason: (sessionId: SessionId, r: StopReason | null) => void;
  upsertToolCall: (sessionId: SessionId, tc: ToolCallState) => void;
  updateToolCall: (sessionId: SessionId, id: string, update: Partial<ToolCallState>) => void;
  addPermissionRequest: (sessionId: SessionId, req: PermissionRequest) => void;
  removePermissionRequest: (sessionId: SessionId) => void;
  setPlan: (sessionId: SessionId, entries: PlanEntry[]) => void;
  setUsage: (sessionId: SessionId, usage: UsageUpdate) => void;
  setConfigOptions: (sessionId: SessionId, configOptions: SessionConfigOption[]) => void;
}

function createSessionData(): SessionData {
  return {
    messages: [],
    isStreaming: false,
    pendingToolCalls: new Map(),
    stopReason: null,
    pendingPermissions: [],
    plan: [],
    usage: null,
    configOptions: [],
  };
}

export const useSessionStore = create<SessionStoreState>((set) => ({
  sessions: new Map(),

  ensureSession: (id) =>
    set((s) => {
      if (s.sessions.has(id)) return s;
      const next = new Map(s.sessions);
      next.set(id, createSessionData());
      return { sessions: next };
    }),

  removeSession: (id) =>
    set((s) => {
      const next = new Map(s.sessions);
      next.delete(id);
      return { sessions: next };
    }),

  resetSession: (id) =>
    set((s) => {
      const next = new Map(s.sessions);
      next.set(id, createSessionData());
      return { sessions: next };
    }),

  addMessage: (sessionId, msg) =>
    set((s) => {
      const data = s.sessions.get(sessionId);
      if (!data) return s;
      const next = new Map(s.sessions);
      next.set(sessionId, { ...data, messages: [...data.messages, msg] });
      return { sessions: next };
    }),

  updateMessage: (sessionId, id, update) =>
    set((s) => {
      const data = s.sessions.get(sessionId);
      if (!data) return s;
      const next = new Map(s.sessions);
      next.set(sessionId, {
        ...data,
        messages: data.messages.map((m) => (m.id === id ? { ...m, ...update } : m)),
      });
      return { sessions: next };
    }),

  appendContent: (sessionId, messageId, role, block) =>
    set((s) => {
      const data = s.sessions.get(sessionId);
      if (!data) return s;
      const exists = data.messages.some((m) => m.id === messageId);
      let messages: Message[];
      if (exists) {
        messages = data.messages.map((m) => {
          if (m.id !== messageId) return m;
          const parts = m.parts;
          const last = parts[parts.length - 1];
          if (last?.type === 'content') {
            const blocks = last.content;
            if (blocks.length > 0) {
              const lastBlock = blocks[blocks.length - 1];
              if (lastBlock.type === 'text' && block.type === 'text') {
                return {
                  ...m,
                  parts: [
                    ...parts.slice(0, -1),
                    { ...last, content: [...blocks.slice(0, -1), { ...lastBlock, text: lastBlock.text + block.text }] },
                  ],
                };
              }
            }
            return {
              ...m,
              parts: [...parts.slice(0, -1), { ...last, content: [...blocks, block] }],
            };
          }
          return { ...m, parts: [...parts, { type: 'content', content: [block] }] };
        });
      } else {
        const newMsg: Message = {
          id: messageId,
          role,
          parts: [{ type: 'content', content: [block] }],
          timestamp: Date.now(),
        };
        messages = [...data.messages, newMsg];
      }
      const next = new Map(s.sessions);
      next.set(sessionId, { ...data, messages });
      return { sessions: next };
    }),

  appendThought: (sessionId, messageId, role, block) =>
    set((s) => {
      const data = s.sessions.get(sessionId);
      if (!data) return s;
      const exists = data.messages.some((m) => m.id === messageId);
      let messages: Message[];
      if (exists) {
        messages = data.messages.map((m) => {
          if (m.id !== messageId) return m;
          const parts = m.parts;
          const last = parts[parts.length - 1];
          if (last?.type === 'thought') {
            const blocks = last.thought;
            if (blocks.length > 0) {
              const lastBlock = blocks[blocks.length - 1];
              if (lastBlock.type === 'text' && block.type === 'text') {
                return {
                  ...m,
                  parts: [
                    ...parts.slice(0, -1),
                    { ...last, thought: [...blocks.slice(0, -1), { ...lastBlock, text: lastBlock.text + block.text }] },
                  ],
                };
              }
            }
            return {
              ...m,
              parts: [...parts.slice(0, -1), { ...last, thought: [...blocks, block] }],
            };
          }
          return { ...m, parts: [...parts, { type: 'thought', thought: [block] }] };
        });
      } else {
        const newMsg: Message = {
          id: messageId,
          role,
          parts: [{ type: 'thought', thought: [block] }],
          timestamp: Date.now(),
        };
        messages = [...data.messages, newMsg];
      }
      const next = new Map(s.sessions);
      next.set(sessionId, { ...data, messages });
      return { sessions: next };
    }),

  setIsStreaming: (sessionId, v) =>
    set((s) => {
      const data = s.sessions.get(sessionId);
      if (!data) return s;
      const next = new Map(s.sessions);
      next.set(sessionId, { ...data, isStreaming: v });
      return { sessions: next };
    }),

  setStopReason: (sessionId, r) =>
    set((s) => {
      const data = s.sessions.get(sessionId);
      if (!data) return s;
      const next = new Map(s.sessions);
      next.set(sessionId, { ...data, stopReason: r });
      return { sessions: next };
    }),

  upsertToolCall: (sessionId, tc) =>
    set((s) => {
      const data = s.sessions.get(sessionId);
      if (!data) return s;
      const next = new Map(s.sessions);
      const toolCalls = new Map(data.pendingToolCalls);
      const existing = toolCalls.get(tc.toolCallId);
      toolCalls.set(tc.toolCallId, existing ? { ...existing, ...tc } : tc);

      const messages = data.messages.map((m, i, arr) => {
        if (i === arr.length - 1 && m.role === 'agent') {
          const parts = m.parts;
          const last = parts[parts.length - 1];
          if (last?.type === 'tool_calls') {
            const tcs = last.toolCalls;
            const idx = tcs.findIndex((t) => t.toolCallId === tc.toolCallId);
            if (idx >= 0) {
              const updatedTcs = [...tcs];
              updatedTcs[idx] = { ...updatedTcs[idx], ...tc };
              return { ...m, parts: [...parts.slice(0, -1), { ...last, toolCalls: updatedTcs }] };
            }
            return { ...m, parts: [...parts.slice(0, -1), { ...last, toolCalls: [...tcs, tc] }] };
          }
          return { ...m, parts: [...parts, { type: 'tool_calls' as const, toolCalls: [tc] }] };
        }
        return m;
      });

      next.set(sessionId, { ...data, pendingToolCalls: toolCalls, messages });
      return { sessions: next };
    }),

  updateToolCall: (sessionId, id, update) =>
    set((s) => {
      const data = s.sessions.get(sessionId);
      if (!data) return s;
      const existing = data.pendingToolCalls.get(id);
      if (!existing) return s;
      const toolCalls = new Map(data.pendingToolCalls);

      let content = existing.content ?? [];
      if (update.content) content = [...content, ...update.content];

      let locations = existing.locations ?? [];
      if (update.locations) locations = [...locations, ...update.locations];

      const updated = { ...existing, ...update, content, locations };
      toolCalls.set(id, updated);

      // Also update tool call on the attached message
      const messages = data.messages.map((m) => {
        const tcPartIdx = m.parts.findIndex((p) => p.type === 'tool_calls' && p.toolCalls.some((t) => t.toolCallId === id));
        if (tcPartIdx >= 0) {
          const part = m.parts[tcPartIdx];
          if (part.type === 'tool_calls') {
            const updatedParts = [...m.parts];
            updatedParts[tcPartIdx] = {
              ...part,
              toolCalls: part.toolCalls.map((t) => (t.toolCallId === id ? updated : t)),
            };
            return { ...m, parts: updatedParts };
          }
        }
        return m;
      });

      const next = new Map(s.sessions);
      next.set(sessionId, { ...data, pendingToolCalls: toolCalls, messages });
      return { sessions: next };
    }),

  addPermissionRequest: (sessionId, req) =>
    set((s) => {
      const data = s.sessions.get(sessionId);
      if (!data) return s;
      const next = new Map(s.sessions);
      next.set(sessionId, {
        ...data,
        pendingPermissions: [...data.pendingPermissions, req],
      });
      return { sessions: next };
    }),

  removePermissionRequest: (sessionId) =>
    set((s) => {
      const data = s.sessions.get(sessionId);
      if (!data) return s;
      const next = new Map(s.sessions);
      next.set(sessionId, {
        ...data,
        pendingPermissions: data.pendingPermissions.filter((r) => r.sessionId !== sessionId),
      });
      return { sessions: next };
    }),

  setPlan: (sessionId, entries) =>
    set((s) => {
      const data = s.sessions.get(sessionId);
      if (!data) return s;
      const next = new Map(s.sessions);
      next.set(sessionId, { ...data, plan: entries });
      return { sessions: next };
    }),

  setUsage: (sessionId, usage) =>
    set((s) => {
      const data = s.sessions.get(sessionId);
      if (!data) return s;
      const next = new Map(s.sessions);
      next.set(sessionId, { ...data, usage });
      return { sessions: next };
    }),

  setConfigOptions: (sessionId, configOptions) =>
    set((s) => {
      const data = s.sessions.get(sessionId);
      if (!data) return s;
      const next = new Map(s.sessions);
      next.set(sessionId, { ...data, configOptions });
      return { sessions: next };
    }),
}));
