import { create } from 'zustand';
import type { Message, ToolCallState, PermissionRequest } from '../types';
import type { SessionId, ContentBlock, StopReason, SessionMode, SessionModeId, ModelInfo, ModelId } from '@agentclientprotocol/sdk';

interface SessionData {
  messages: Message[];
  isStreaming: boolean;
  pendingToolCalls: Map<string, ToolCallState>;
  currentModeId: SessionModeId | null;
  availableModes: SessionMode[];
  currentModelId: ModelId | null;
  availableModels: ModelInfo[];
  stopReason: StopReason | null;
  pendingPermissions: PermissionRequest[];
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
  setCurrentMode: (sessionId: SessionId, modeId: SessionModeId | null) => void;
  setAvailableModes: (sessionId: SessionId, modes: SessionMode[]) => void;
  setCurrentModel: (sessionId: SessionId, modelId: ModelId | null) => void;
  setAvailableModels: (sessionId: SessionId, models: ModelInfo[]) => void;
  addPermissionRequest: (sessionId: SessionId, req: PermissionRequest) => void;
  removePermissionRequest: (sessionId: SessionId) => void;
}

function createSessionData(): SessionData {
  return {
    messages: [],
    isStreaming: false,
    pendingToolCalls: new Map(),
    currentModeId: null,
    availableModes: [],
    currentModelId: null,
    availableModels: [],
    stopReason: null,
    pendingPermissions: [],
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
          const content = m.content;
          if (content.length > 0) {
            const last = content[content.length - 1];
            if (last.type === 'text' && block.type === 'text') {
              return { ...m, content: [...content.slice(0, -1), { ...last, text: last.text + block.text }] };
            }
          }
          return { ...m, content: [...content, block] };
        });
      } else {
        const newMsg: Message = {
          id: messageId,
          role,
          content: [block],
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
          const thought = m.thought ?? [];
          if (thought.length > 0) {
            const last = thought[thought.length - 1];
            if (last.type === 'text' && block.type === 'text') {
              return { ...m, thought: [...thought.slice(0, -1), { ...last, text: last.text + block.text }] };
            }
          }
          return { ...m, thought: [...thought, block] };
        });
      } else {
        const newMsg: Message = {
          id: messageId,
          role,
          content: [],
          thought: [block],
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

      // Also attach tool call to the latest agent message
      const messages = data.messages.map((m, i, arr) => {
        if (i === arr.length - 1 && m.role === 'agent') {
          const existingTcs = m.toolCalls ?? [];
          const idx = existingTcs.findIndex((t) => t.toolCallId === tc.toolCallId);
          if (idx >= 0) {
            const updatedTcs = [...existingTcs];
            updatedTcs[idx] = { ...updatedTcs[idx], ...tc };
            return { ...m, toolCalls: updatedTcs };
          }
          return { ...m, toolCalls: [...existingTcs, tc] };
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
        if (m.toolCalls?.some((t) => t.toolCallId === id)) {
          return {
            ...m,
            toolCalls: m.toolCalls.map((t) => (t.toolCallId === id ? updated : t)),
          };
        }
        return m;
      });

      const next = new Map(s.sessions);
      next.set(sessionId, { ...data, pendingToolCalls: toolCalls, messages });
      return { sessions: next };
    }),

  setCurrentMode: (sessionId, modeId) =>
    set((s) => {
      const data = s.sessions.get(sessionId);
      if (!data) return s;
      const next = new Map(s.sessions);
      next.set(sessionId, { ...data, currentModeId: modeId });
      return { sessions: next };
    }),

  setAvailableModes: (sessionId, modes) =>
    set((s) => {
      const data = s.sessions.get(sessionId);
      if (!data) return s;
      const next = new Map(s.sessions);
      next.set(sessionId, { ...data, availableModes: modes });
      return { sessions: next };
    }),

  setCurrentModel: (sessionId, modelId) =>
    set((s) => {
      const data = s.sessions.get(sessionId);
      if (!data) return s;
      const next = new Map(s.sessions);
      next.set(sessionId, { ...data, currentModelId: modelId });
      return { sessions: next };
    }),

  setAvailableModels: (sessionId, models) =>
    set((s) => {
      const data = s.sessions.get(sessionId);
      if (!data) return s;
      const next = new Map(s.sessions);
      next.set(sessionId, { ...data, availableModels: models });
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
}));
