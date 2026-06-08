import { createStore } from 'zustand/vanilla';
import type { Message, ToolCallState, PermissionRequest, TerminalState } from '../types';
import type { SessionId, ContentBlock, StopReason, PlanEntry, UsageUpdate, SessionConfigOption, AvailableCommand, TerminalExitStatus } from '@agentclientprotocol/sdk';
import { generateId } from '../utils/id';

interface SessionData {
  messages: Message[];
  isStreaming: boolean;
  pendingToolCalls: Map<string, ToolCallState>;
  pendingPermissions: PermissionRequest[];
  plan: PlanEntry[];
  usage: UsageUpdate | null;
  configOptions: SessionConfigOption[];
  availableCommands: AvailableCommand[];
  terminals: Map<string, TerminalState>;
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
  setStopReason: (sessionId: SessionId, r: StopReason) => void;
  upsertToolCall: (sessionId: SessionId, tc: ToolCallState) => void;
  updateToolCall: (sessionId: SessionId, id: string, update: Partial<ToolCallState>) => void;
  addPermissionRequest: (sessionId: SessionId, req: PermissionRequest) => void;
  removePermissionRequest: (sessionId: SessionId, requestId?: string) => void;
  setPlan: (sessionId: SessionId, entries: PlanEntry[]) => void;
  setUsage: (sessionId: SessionId, usage: UsageUpdate) => void;
  setConfigOptions: (sessionId: SessionId, configOptions: SessionConfigOption[]) => void;
  setAvailableCommands: (sessionId: SessionId, commands: AvailableCommand[]) => void;
  setPartExpanded: (sessionId: SessionId, messageId: string, partIndex: number, expanded: boolean) => void;

  addTerminal: (sessionId: SessionId, terminal: TerminalState) => void;
  updateTerminalOutput: (sessionId: SessionId, terminalId: string, output: string, truncated: boolean) => void;
  updateTerminalExit: (sessionId: SessionId, terminalId: string, exitStatus: TerminalExitStatus | null) => void;
  removeTerminal: (sessionId: SessionId, terminalId: string) => void;
}

function createSessionData(): SessionData {
  return {
    messages: [],
    isStreaming: false,
    pendingToolCalls: new Map(),
    pendingPermissions: [],
    plan: [],
    usage: null,
    configOptions: [],
    availableCommands: [],
    terminals: new Map(),
  };
}

// --- Message update helpers (avoid O(n) message scans during streaming) ---

function appendContentBlockToMessage(m: Message, block: ContentBlock): Message {
  const parts = m.parts;
  const last = parts[parts.length - 1];
  if (last?.type === 'content') {
    const blocks = last.content;
    if (blocks.length > 0) {
      const lastBlock = blocks[blocks.length - 1];
      if (lastBlock.type === 'text' && block.type === 'text') {
        const hasAnnotations = 'annotations' in block && block.annotations != null;
        if (!hasAnnotations) {
          return {
            ...m,
            parts: [
              ...parts.slice(0, -1),
              { ...last, content: [...blocks.slice(0, -1), { ...lastBlock, text: lastBlock.text + block.text }] },
            ],
          };
        }
      }
    }
    return {
      ...m,
      parts: [...parts.slice(0, -1), { ...last, content: [...blocks, block] }],
    };
  }
  return { ...m, parts: [...parts, { type: 'content', content: [block] }] };
}

function appendThoughtBlockToMessage(m: Message, block: ContentBlock): Message {
  const parts = m.parts;
  const last = parts[parts.length - 1];
  if (last?.type === 'thought') {
    const blocks = last.thought;
    if (blocks.length > 0) {
      const lastBlock = blocks[blocks.length - 1];
      if (lastBlock.type === 'text' && block.type === 'text') {
        const hasAnnotations = 'annotations' in block && block.annotations != null;
        if (!hasAnnotations) {
          return {
            ...m,
            parts: [
              ...parts.slice(0, -1),
              { ...last, thought: [...blocks.slice(0, -1), { ...lastBlock, text: lastBlock.text + block.text }] },
            ],
          };
        }
      }
    }
    return {
      ...m,
      parts: [...parts.slice(0, -1), { ...last, thought: [...blocks, block] }],
    };
  }
  return { ...m, parts: [...parts, { type: 'thought', thought: [block] }] };
}

export const sessionStore = createStore<SessionStoreState>((set) => ({
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
      const msgs = data.messages;
      const lastIdx = msgs.length - 1;

      let messages: Message[];

      // Fast path: last message matches (common streaming case, O(1))
      if (lastIdx >= 0 && msgs[lastIdx].id === messageId) {
        const updated = appendContentBlockToMessage(msgs[lastIdx], block);
        messages = [...msgs.slice(0, lastIdx), updated];
      } else {
        // Slow path: find the target message (for edge cases, O(n) but rare)
        const idx = msgs.findIndex((m) => m.id === messageId);
        if (idx >= 0) {
          const updated = appendContentBlockToMessage(msgs[idx], block);
          messages = [...msgs.slice(0, idx), updated, ...msgs.slice(idx + 1)];
        } else {
          const newMsg: Message = {
            id: messageId,
            role,
            parts: [{ type: 'content', content: [block] }],
            timestamp: Date.now(),
          };
          messages = [...msgs, newMsg];
        }
      }

      const next = new Map(s.sessions);
      next.set(sessionId, { ...data, messages });
      return { sessions: next };
    }),

  appendThought: (sessionId, messageId, role, block) =>
    set((s) => {
      const data = s.sessions.get(sessionId);
      if (!data) return s;
      const msgs = data.messages;
      const lastIdx = msgs.length - 1;

      let messages: Message[];

      // Fast path: last message matches (common streaming case, O(1))
      if (lastIdx >= 0 && msgs[lastIdx].id === messageId) {
        const updated = appendThoughtBlockToMessage(msgs[lastIdx], block);
        messages = [...msgs.slice(0, lastIdx), updated];
      } else {
        // Slow path: find the target message (for edge cases, O(n) but rare)
        const idx = msgs.findIndex((m) => m.id === messageId);
        if (idx >= 0) {
          const updated = appendThoughtBlockToMessage(msgs[idx], block);
          messages = [...msgs.slice(0, idx), updated, ...msgs.slice(idx + 1)];
        } else {
          const newMsg: Message = {
            id: messageId,
            role,
            parts: [{ type: 'thought', thought: [block] }],
            timestamp: Date.now(),
          };
          messages = [...msgs, newMsg];
        }
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
      if (!data || data.messages.length === 0) return s;
      const next = new Map(s.sessions);
      const messages = [...data.messages];
      const lastIdx = messages.length - 1;
      messages[lastIdx] = { ...messages[lastIdx], stopReason: r };
      next.set(sessionId, { ...data, messages });
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

      const lastMsg = data.messages[data.messages.length - 1];
      let messages: Message[];

      if (lastMsg && lastMsg.role === 'agent') {
        const parts = lastMsg.parts;
        const last = parts[parts.length - 1];
        if (last?.type === 'tool_calls') {
          const tcs = last.toolCalls;
          const idx = tcs.findIndex((t) => t.toolCallId === tc.toolCallId);
          if (idx >= 0) {
            const updatedTcs = [...tcs];
            updatedTcs[idx] = { ...updatedTcs[idx], ...tc };
            messages = [
              ...data.messages.slice(0, -1),
              { ...lastMsg, parts: [...parts.slice(0, -1), { ...last, toolCalls: updatedTcs }] },
            ];
          } else {
            messages = [
              ...data.messages.slice(0, -1),
              { ...lastMsg, parts: [...parts.slice(0, -1), { ...last, toolCalls: [...tcs, tc] }] },
            ];
          }
        } else {
          messages = [
            ...data.messages.slice(0, -1),
            { ...lastMsg, parts: [...parts, { type: 'tool_calls' as const, toolCalls: [tc] }] },
          ];
        }
      } else {
        messages = [
          ...data.messages,
          {
            id: generateId('msg'),
            role: 'agent',
            parts: [{ type: 'tool_calls' as const, toolCalls: [tc] }],
            timestamp: Date.now(),
          },
        ];
      }

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

      const updated = {
        ...existing,
        ...update,
        content: 'content' in update ? (update.content ?? []) : existing.content,
        locations: 'locations' in update ? (update.locations ?? []) : existing.locations,
      };
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

  removePermissionRequest: (sessionId, requestId) =>
    set((s) => {
      const data = s.sessions.get(sessionId);
      if (!data) return s;
      const next = new Map(s.sessions);
      next.set(sessionId, {
        ...data,
        pendingPermissions: data.pendingPermissions.filter((r) => r.id !== requestId),
      });
      return { sessions: next };
    }),

  setPlan: (sessionId, entries) =>
    set((s) => {
      const data = s.sessions.get(sessionId);
      if (!data) return s;
      const messages = [
        ...data.messages,
        {
          id: generateId('plan'),
          role: 'agent' as const,
          parts: [{ type: 'plan' as const, plan: entries }],
          timestamp: Date.now(),
        },
      ];
      const next = new Map(s.sessions);
      next.set(sessionId, { ...data, plan: entries, messages });
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

  setAvailableCommands: (sessionId, commands) =>
    set((s) => {
      const data = s.sessions.get(sessionId);
      if (!data) return s;
      const next = new Map(s.sessions);
      next.set(sessionId, { ...data, availableCommands: commands });
      return { sessions: next };
    }),

  setPartExpanded: (sessionId, messageId, partIndex, expanded) =>
    set((s) => {
      const data = s.sessions.get(sessionId);
      if (!data) return s;
      const messages = data.messages.map((m) => {
        if (m.id !== messageId) return m;
        const part = m.parts[partIndex];
        if (!part || (part.type !== 'thought' && part.type !== 'tool_calls')) return m;
        const updatedPart = { ...part, expanded };
        const parts = [...m.parts];
        parts[partIndex] = updatedPart;
        return { ...m, parts };
      });
      const next = new Map(s.sessions);
      next.set(sessionId, { ...data, messages });
      return { sessions: next };
    }),

  addTerminal: (sessionId, terminal) =>
    set((s) => {
      const data = s.sessions.get(sessionId);
      if (!data) return s;
      const terminals = new Map(data.terminals);
      terminals.set(terminal.terminalId, terminal);
      const next = new Map(s.sessions);
      next.set(sessionId, { ...data, terminals });
      return { sessions: next };
    }),

  updateTerminalOutput: (sessionId, terminalId, output, truncated) =>
    set((s) => {
      const data = s.sessions.get(sessionId);
      if (!data) return s;
      const existing = data.terminals.get(terminalId);
      if (!existing) return s;
      const terminals = new Map(data.terminals);
      terminals.set(terminalId, { ...existing, output, truncated });
      const next = new Map(s.sessions);
      next.set(sessionId, { ...data, terminals });
      return { sessions: next };
    }),

  updateTerminalExit: (sessionId, terminalId, exitStatus) =>
    set((s) => {
      const data = s.sessions.get(sessionId);
      if (!data) return s;
      const existing = data.terminals.get(terminalId);
      if (!existing) return s;
      const terminals = new Map(data.terminals);
      terminals.set(terminalId, { ...existing, exitStatus });
      const next = new Map(s.sessions);
      next.set(sessionId, { ...data, terminals });
      return { sessions: next };
    }),

  removeTerminal: (sessionId, terminalId) =>
    set((s) => {
      const data = s.sessions.get(sessionId);
      if (!data) return s;
      if (!data.terminals.has(terminalId)) return s;
      const terminals = new Map(data.terminals);
      terminals.delete(terminalId);
      const next = new Map(s.sessions);
      next.set(sessionId, { ...data, terminals });
      return { sessions: next };
    }),
}));
