import { describe, it, expect, beforeEach } from 'vitest';
import { sessionStore } from './sessionStore';
import type { Message, ToolCallState, PermissionRequest } from '../types';
import type { ContentBlock, PlanEntry, UsageUpdate, SessionConfigOption, AvailableCommand } from '@agentclientprotocol/sdk';

const SID = 'sess-1';

/**
 * Reset the sessions map for a clean slate. Stores are module-level singletons,
 * so state leaks across tests unless we clear them. Default (merge) mode
 * replaces ONLY `sessions` while preserving the action methods on the store.
 */
function resetStore(): void {
  sessionStore.setState({ sessions: new Map() });
}

function getState() {
  return sessionStore.getState().sessions.get(SID)!;
}

/** Helper: build a plain text content block (no annotations → batchable / mergeable). */
function textBlock(text: string): ContentBlock {
  return { type: 'text', text, _meta: null, annotations: null };
}

/** Helper: a text block carrying annotations → must NOT be merged. */
function annotatedTextBlock(text: string): ContentBlock {
  return { type: 'text', text, _meta: null, annotations: { audience: ['assistant'] } };
}

/** Helper: a non-text block (image) → must be appended as a new block, never merged. */
function imageBlock(): ContentBlock {
  return { type: 'image', data: 'AAAA', mimeType: 'image/png', _meta: null, annotations: null };
}

beforeEach(() => {
  resetStore();
});

describe('sessionStore — lifecycle', () => {
  it('ensureSession creates an empty session and is idempotent', () => {
    sessionStore.getState().ensureSession(SID);
    sessionStore.getState().ensureSession(SID);
    const data = getState();
    expect(data.messages).toEqual([]);
    expect(data.isStreaming).toBe(false);
    expect(data.pendingToolCalls.size).toBe(0);
    expect(data.pendingPermissions).toEqual([]);
    expect(data.plan).toEqual([]);
    expect(data.usage).toBeNull();
  });

  it('removeSession deletes the session', () => {
    sessionStore.getState().ensureSession(SID);
    sessionStore.getState().removeSession(SID);
    expect(sessionStore.getState().sessions.has(SID)).toBe(false);
  });

  it('resetSession wipes data but keeps the session entry', () => {
    sessionStore.getState().ensureSession(SID);
    sessionStore.getState().addMessage(SID, { id: 'm1', role: 'user', parts: [], timestamp: 0 });
    sessionStore.getState().setIsStreaming(SID, true);
    sessionStore.getState().resetSession(SID);
    const data = getState();
    expect(data.messages).toEqual([]);
    expect(data.isStreaming).toBe(false);
  });

  it('all mutators are no-ops when the session does not exist', () => {
    const before = sessionStore.getState();
    sessionStore.getState().addMessage(SID, { id: 'x', role: 'user', parts: [], timestamp: 0 });
    sessionStore.getState().appendContent(SID, 'x', 'user', textBlock('hi'));
    sessionStore.getState().setIsStreaming(SID, true);
    sessionStore.getState().upsertToolCall(SID, { toolCallId: 't1', title: 'T' });
    sessionStore.getState().setPlan(SID, []);
    expect(sessionStore.getState()).toBe(before);
  });
});

describe('sessionStore — appendContent (streaming merge)', () => {
  beforeEach(() => {
    sessionStore.getState().ensureSession(SID);
  });

  it('creates a new agent message on the first chunk', () => {
    sessionStore.getState().appendContent(SID, 'msg-1', 'agent', textBlock('Hello'));
    const msgs = getState().messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe('agent');
    expect(msgs[0].id).toBe('msg-1');
    expect(msgs[0].parts).toEqual([{ type: 'content', content: [textBlock('Hello')] }]);
  });

  it('merges consecutive plain text chunks into the last text block (fast path)', () => {
    sessionStore.getState().appendContent(SID, 'msg-1', 'agent', textBlock('Hel'));
    sessionStore.getState().appendContent(SID, 'msg-1', 'agent', textBlock('lo'));
    sessionStore.getState().appendContent(SID, 'msg-1', 'agent', textBlock(' world'));
    const msgs = getState().messages;
    expect(msgs).toHaveLength(1);
    const part = msgs[0].parts[0];
    expect(part.type).toBe('content');
    if (part.type === 'content') {
      expect(part.content).toHaveLength(1);
      expect((part.content[0] as { text: string }).text).toBe('Hello world');
    }
  });

  it('does NOT merge a text chunk that carries annotations', () => {
    sessionStore.getState().appendContent(SID, 'msg-1', 'agent', textBlock('Hel'));
    sessionStore.getState().appendContent(SID, 'msg-1', 'agent', annotatedTextBlock('lo'));
    const part = getState().messages[0].parts[0];
    if (part.type === 'content') {
      // Two separate blocks — the annotated one is not concatenated onto the plain one.
      expect(part.content).toHaveLength(2);
      expect((part.content[0] as { text: string }).text).toBe('Hel');
      expect((part.content[1] as { text: string }).text).toBe('lo');
    }
  });

  it('appends a non-text block as a new block instead of merging', () => {
    sessionStore.getState().appendContent(SID, 'msg-1', 'agent', textBlock('Look'));
    sessionStore.getState().appendContent(SID, 'msg-1', 'agent', imageBlock());
    const part = getState().messages[0].parts[0];
    if (part.type === 'content') {
      expect(part.content).toHaveLength(2);
      expect(part.content[1].type).toBe('image');
    }
  });

  it('uses the slow path when appending to a non-tail message', () => {
    // Build two messages, then append to the FIRST one (not the tail).
    sessionStore.getState().appendContent(SID, 'msg-1', 'agent', textBlock('first'));
    sessionStore.getState().appendContent(SID, 'msg-2', 'agent', textBlock('second'));
    sessionStore.getState().appendContent(SID, 'msg-1', 'agent', textBlock('!'));
    const msgs = getState().messages;
    expect(msgs).toHaveLength(2);
    expect(msgs[0].id).toBe('msg-1');
    const part0 = msgs[0].parts[0];
    if (part0.type === 'content') {
      expect((part0.content[0] as { text: string }).text).toBe('first!');
    }
    // The tail message is untouched.
    const part1 = msgs[1].parts[0];
    if (part1.type === 'content') {
      expect((part1.content[0] as { text: string }).text).toBe('second');
    }
  });

  it('creates a new message when the messageId is unknown', () => {
    sessionStore.getState().appendContent(SID, 'msg-1', 'agent', textBlock('first'));
    sessionStore.getState().appendContent(SID, 'msg-2', 'agent', textBlock('second'));
    const msgs = getState().messages;
    expect(msgs.map((m) => m.id)).toEqual(['msg-1', 'msg-2']);
  });

  it('respects the role of newly created messages', () => {
    sessionStore.getState().appendContent(SID, 'u-1', 'user', textBlock('hi'));
    sessionStore.getState().appendContent(SID, 'a-1', 'agent', textBlock('hey'));
    const msgs = getState().messages;
    expect(msgs[0].role).toBe('user');
    expect(msgs[1].role).toBe('agent');
  });
});

describe('sessionStore — appendThought', () => {
  beforeEach(() => {
    sessionStore.getState().ensureSession(SID);
  });

  it('creates a thought part and merges consecutive thought text', () => {
    sessionStore.getState().appendThought(SID, 'th-1', 'agent', textBlock('thin'));
    sessionStore.getState().appendThought(SID, 'th-1', 'agent', textBlock('king'));
    const part = getState().messages[0].parts[0];
    expect(part.type).toBe('thought');
    if (part.type === 'thought') {
      expect(part.thought).toHaveLength(1);
      expect((part.thought[0] as { text: string }).text).toBe('thinking');
    }
  });

  it('separates thought parts from content parts', () => {
    sessionStore.getState().appendContent(SID, 'm-1', 'agent', textBlock('said'));
    sessionStore.getState().appendThought(SID, 'm-1', 'agent', textBlock('thought'));
    const parts = getState().messages[0].parts;
    expect(parts).toHaveLength(2);
    expect(parts[0].type).toBe('content');
    expect(parts[1].type).toBe('thought');
  });
});

describe('sessionStore — tool calls', () => {
  const tc = (id: string, expanded?: boolean): ToolCallState => ({
    toolCallId: id,
    title: `tool-${id}`,
    status: 'in_progress',
    content: [],
    locations: [],
    kind: 'read',
    rawInput: null,
    rawOutput: null,
    expanded,
  });

  beforeEach(() => {
    sessionStore.getState().ensureSession(SID);
  });

  it('upsertToolCall attaches a tool_calls part to the tail agent message', () => {
    sessionStore.getState().appendContent(SID, 'm-1', 'agent', textBlock('msg'));
    sessionStore.getState().upsertToolCall(SID, tc('t1'));
    const msgs = getState().messages;
    expect(msgs).toHaveLength(1);
    const part = msgs[0].parts[1];
    expect(part.type).toBe('tool_calls');
    if (part.type === 'tool_calls') {
      expect(part.toolCalls).toHaveLength(1);
      expect(part.toolCalls[0].toolCallId).toBe('t1');
    }
  });

  it('upsertToolCall creates an agent message when none exists', () => {
    sessionStore.getState().upsertToolCall(SID, tc('t1'));
    const msgs = getState().messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe('agent');
  });

  it('upsertToolCall appends to an existing tool_calls part and preserves UI expanded state', () => {
    sessionStore.getState().upsertToolCall(SID, { ...tc('t1'), expanded: true });
    // Update without passing expanded — must keep the existing UI-only expanded=true.
    sessionStore.getState().upsertToolCall(SID, { ...tc('t1'), status: 'completed', title: 'renamed' });
    const data = getState();
    const fromMap = data.pendingToolCalls.get('t1')!;
    expect(fromMap.status).toBe('completed');
    expect(fromMap.expanded).toBe(true);
    const part = data.messages[0].parts[0];
    if (part.type === 'tool_calls') {
      expect(part.toolCalls).toHaveLength(1);
      expect(part.toolCalls[0].title).toBe('renamed');
      expect(part.toolCalls[0].expanded).toBe(true);
    }
  });

  it('updateToolCall syncs both pendingToolCalls and the embedded message part', () => {
    sessionStore.getState().upsertToolCall(SID, tc('t1'));
    sessionStore.getState().updateToolCall(SID, 't1', {
      status: 'completed',
      rawOutput: 'done',
      content: [{ type: 'content', content: { type: 'text', text: 'out', _meta: null, annotations: null } }],
    });
    const data = getState();
    const tc1 = data.pendingToolCalls.get('t1')!;
    expect(tc1.status).toBe('completed');
    expect(tc1.rawOutput).toBe('done');
    expect(tc1.content).toHaveLength(1);
    // Same update reflected in the embedded message part.
    const part = data.messages[0].parts[0];
    if (part.type === 'tool_calls') {
      expect(part.toolCalls[0].status).toBe('completed');
    }
  });

  it('updateToolCall preserves expanded state', () => {
    sessionStore.getState().upsertToolCall(SID, { ...tc('t1'), expanded: true });
    sessionStore.getState().updateToolCall(SID, 't1', { status: 'completed' });
    expect(getState().pendingToolCalls.get('t1')!.expanded).toBe(true);
  });

  it('updateToolCall is a no-op for an unknown toolCallId', () => {
    const before = sessionStore.getState();
    sessionStore.getState().updateToolCall(SID, 'nope', { status: 'completed' });
    expect(sessionStore.getState()).toBe(before);
  });

  it('setToolCallExpanded toggles UI state in both map and message part', () => {
    sessionStore.getState().upsertToolCall(SID, tc('t1'));
    sessionStore.getState().setToolCallExpanded(SID, 't1', true);
    const data = getState();
    expect(data.pendingToolCalls.get('t1')!.expanded).toBe(true);
    const part = data.messages[0].parts[0];
    if (part.type === 'tool_calls') {
      expect(part.toolCalls[0].expanded).toBe(true);
    }
  });
});

describe('sessionStore — permissions', () => {
  beforeEach(() => {
    sessionStore.getState().ensureSession(SID);
  });

  it('addPermissionRequest appends and removePermissionRequest filters by id', () => {
    const req1: PermissionRequest = {
      id: 'p1', sessionId: SID, toolCall: { toolCallId: 't1', title: 'T' }, options: [],
      resolve: () => {}, reject: () => {},
    };
    const req2: PermissionRequest = {
      id: 'p2', sessionId: SID, toolCall: { toolCallId: 't2', title: 'T2' }, options: [],
      resolve: () => {}, reject: () => {},
    };
    sessionStore.getState().addPermissionRequest(SID, req1);
    sessionStore.getState().addPermissionRequest(SID, req2);
    expect(getState().pendingPermissions.map((r) => r.id)).toEqual(['p1', 'p2']);
    sessionStore.getState().removePermissionRequest(SID, 'p1');
    expect(getState().pendingPermissions.map((r) => r.id)).toEqual(['p2']);
  });

  it('rejectAllPermissions rejects every pending request and clears the queue', () => {
    const rejects: string[] = [];
    const r1: PermissionRequest = {
      id: 'p1', sessionId: SID, toolCall: { toolCallId: 't1', title: 'T' }, options: [],
      resolve: () => {}, reject: () => { rejects.push('p1'); },
    };
    const r2: PermissionRequest = {
      id: 'p2', sessionId: SID, toolCall: { toolCallId: 't2', title: 'T2' }, options: [],
      resolve: () => {}, reject: () => { rejects.push('p2'); },
    };
    sessionStore.getState().addPermissionRequest(SID, r1);
    sessionStore.getState().addPermissionRequest(SID, r2);
    sessionStore.getState().rejectAllPermissions(SID);
    expect(rejects).toEqual(['p1', 'p2']);
    expect(getState().pendingPermissions).toEqual([]);
  });

  it('rejectAllPermissions is a no-op on a session with no pending requests', () => {
    const before = sessionStore.getState();
    sessionStore.getState().rejectAllPermissions(SID);
    expect(sessionStore.getState()).toBe(before);
  });

  it('removeSession rejects pending permissions before dropping the entry', () => {
    const rejects: string[] = [];
    const r: PermissionRequest = {
      id: 'p1', sessionId: SID, toolCall: { toolCallId: 't1', title: 'T' }, options: [],
      resolve: () => {}, reject: () => { rejects.push('p1'); },
    };
    sessionStore.getState().addPermissionRequest(SID, r);
    sessionStore.getState().removeSession(SID);
    expect(rejects).toEqual(['p1']);
    expect(sessionStore.getState().sessions.has(SID)).toBe(false);
  });

  it('resetSession rejects pending permissions before wiping the entry', () => {
    const rejects: string[] = [];
    const r: PermissionRequest = {
      id: 'p1', sessionId: SID, toolCall: { toolCallId: 't1', title: 'T' }, options: [],
      resolve: () => {}, reject: () => { rejects.push('p1'); },
    };
    sessionStore.getState().addPermissionRequest(SID, r);
    sessionStore.getState().resetSession(SID);
    expect(rejects).toEqual(['p1']);
    expect(getState().pendingPermissions).toEqual([]);
  });

  it('a misbehaving reject callback does not block cleanup of the rest', () => {
    const good: string[] = [];
    const bad: PermissionRequest = {
      id: 'bad', sessionId: SID, toolCall: { toolCallId: 't0', title: 'T0' }, options: [],
      resolve: () => {}, reject: () => { throw new Error('boom'); },
    };
    const r2: PermissionRequest = {
      id: 'p2', sessionId: SID, toolCall: { toolCallId: 't2', title: 'T2' }, options: [],
      resolve: () => {}, reject: () => { good.push('p2'); },
    };
    sessionStore.getState().addPermissionRequest(SID, bad);
    sessionStore.getState().addPermissionRequest(SID, r2);
    expect(() => sessionStore.getState().rejectAllPermissions(SID)).not.toThrow();
    expect(good).toEqual(['p2']);
    expect(getState().pendingPermissions).toEqual([]);
  });
});

describe('sessionStore — plan / usage / config / commands / stopReason', () => {
  beforeEach(() => {
    sessionStore.getState().ensureSession(SID);
  });

  it('setPlan stores entries and appends a plan message', () => {
    const entries: PlanEntry[] = [
      { content: 'step 1', priority: 'high', status: 'in_progress' },
      { content: 'step 2', priority: 'medium', status: 'pending' },
    ];
    sessionStore.getState().setPlan(SID, entries);
    const data = getState();
    expect(data.plan).toBe(entries);
    const planMsg = data.messages[0];
    expect(planMsg.role).toBe('agent');
    const part = planMsg.parts[0];
    expect(part.type).toBe('plan');
    if (part.type === 'plan') expect(part.plan).toBe(entries);
  });

  it('setStopReason updates only the tail message and is a no-op when empty', () => {
    sessionStore.getState().appendContent(SID, 'm-1', 'agent', textBlock('hi'));
    sessionStore.getState().setStopReason(SID, 'max_tokens');
    expect(getState().messages[0].stopReason).toBe('max_tokens');

    // No-op on empty message list.
    sessionStore.getState().removeSession(SID);
    sessionStore.getState().ensureSession(SID);
    const before = sessionStore.getState();
    sessionStore.getState().setStopReason(SID, 'end_turn');
    expect(sessionStore.getState()).toBe(before);
  });

  it('setUsage / setConfigOptions / setAvailableCommands store values', () => {
    const usage: UsageUpdate = { size: 1000, used: 500 };
    const configs: SessionConfigOption[] = [{ id: 'model', type: 'select', name: 'Model', options: [] } as unknown as SessionConfigOption];
    const cmds: AvailableCommand[] = [{ name: 'plan', description: 'Make a plan' }];
    sessionStore.getState().setUsage(SID, usage);
    sessionStore.getState().setConfigOptions(SID, configs);
    sessionStore.getState().setAvailableCommands(SID, cmds);
    const data = getState();
    expect(data.usage).toBe(usage);
    expect(data.configOptions).toBe(configs);
    expect(data.availableCommands).toBe(cmds);
  });

  it('setPartExpanded toggles a thought part expanded flag', () => {
    sessionStore.getState().appendThought(SID, 'm-1', 'agent', textBlock('think'));
    sessionStore.getState().setPartExpanded(SID, 'm-1', 0, true);
    const part = getState().messages[0].parts[0];
    if (part.type === 'thought') expect(part.expanded).toBe(true);
  });
});

describe('sessionStore — addMessage / updateMessage', () => {
  beforeEach(() => {
    sessionStore.getState().ensureSession(SID);
  });

  it('addMessage appends and updateMessage merges by id', () => {
    const m: Message = { id: 'm1', role: 'user', parts: [{ type: 'content', content: [textBlock('a')] }], timestamp: 1 };
    sessionStore.getState().addMessage(SID, m);
    sessionStore.getState().updateMessage(SID, 'm1', { stopReason: 'end_turn' });
    expect(getState().messages[0].stopReason).toBe('end_turn');
  });
});
