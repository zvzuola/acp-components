import { AcpClient } from './client/AcpClient';
import type { StdioTransportFactory } from './client/AcpClient';
import { acpStore } from './store/acpStore';
import { sessionStore } from './store/sessionStore';
import { skillStore } from './store/skillStore';
import type { ToolCallState } from './types';
import type { AgentConfig } from './types';
import type { RequestPermissionResponse, ClientCapabilities, ContentBlock } from '@agentclientprotocol/sdk';
import type { PermissionRequest } from './types';

function generateMsgId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// Content chunk batching — reduces React re-render frequency during streaming
// by accumulating text chunks over a short window and applying them as a
// single merged update instead of firing on every individual chunk.
//
// Batching is scoped PER SESSION: each session owns its own buffer + flush
// timer, so a busy session running tool calls cannot interrupt another
// session's accumulation window. See `setupSessionUpdateHandler`.
// ---------------------------------------------------------------------------

const BATCH_WINDOW_MS = 16; // ~1 frame at 60 fps — imperceptible delay, aligned with display

/** Check whether a ContentBlock is a plain text block (suitable for batching). */
function isTextBlock(block: ContentBlock): block is ContentBlock & { type: 'text'; text: string } {
  return block.type === 'text' && !('annotations' in block && block.annotations != null);
}

export interface MultiAgentProviderOptions {
  /**
   * Initial built-in agent set supplied by the host (e.g. its default agent
   * config). Optional — a host with no built-in agents can omit it and rely on
   * user-added agents (persisted to `storage('agents')`) instead. Defaults to
   * `[]`.
   */
  agents?: AgentConfig[];
}

export interface MultiAgentProviderInstance {
  ready: boolean;
  subscribe(fn: () => void): () => void;
  destroy(): void;
  getClient(agentId: string): AcpClient | null;
  addAgent(config: AgentConfig): Promise<void>;
  removeAgent(agentId: string): Promise<void>;
}

function setupSessionUpdateHandler(client: AcpClient): () => void {
  // 追踪每个 session+role 的当前 messageId
  // 只有连续的同类型 chunk 才复用，中间插入其他类型消息时清除缓存
  const lastMsgIdBySession = new Map<string, Record<string, string>>();

  // --- Per-session chunk batching ---
  // 每个 session 独享自己的 buffer + flush timer，互不打断：
  // 某个 session 频繁触发 tool_call 不会再把其他 session 正在累积的文本提前冲掉。
  interface ChunkBatch {
    messageId: string;
    role: 'agent' | 'user';
    /** Whether this batch targets `appendContent` or `appendThought`. */
    batchType: 'content' | 'thought';
    /** Accumulated text for text-type blocks only. Non-text blocks are NOT batched. */
    mergedText: string;
  }
  interface SessionBatcher {
    /** Keyed by "messageId:role:batchType" */
    buffer: Map<string, ChunkBatch>;
    timer: ReturnType<typeof setTimeout> | null;
  }
  /** 仅持有「有待 flush 文本」的 session，flush 后即移除，避免长期驻留泄漏。 */
  const batchers = new Map<string, SessionBatcher>();

  function makeBatchKey(messageId: string, role: string, batchType: 'content' | 'thought'): string {
    return `${messageId}:${role}:${batchType}`;
  }

  /** Flush 并清理指定 session 的批次（timer + buffer）。无批次时为 no-op。 */
  function flushSessionBatcher(sessionId: string): void {
    const batcher = batchers.get(sessionId);
    if (!batcher) return;
    if (batcher.timer) {
      clearTimeout(batcher.timer);
      batcher.timer = null;
    }
    if (batcher.buffer.size === 0) {
      batchers.delete(sessionId);
      return;
    }

    const store = sessionStore.getState();
    for (const [, batch] of batcher.buffer) {
      const block: ContentBlock = {
        type: 'text',
        text: batch.mergedText,
        _meta: null,
        annotations: null,
      };
      if (batch.batchType === 'content') {
        store.appendContent(sessionId, batch.messageId, batch.role, block);
      } else {
        store.appendThought(sessionId, batch.messageId, batch.role, block);
      }
    }
    batcher.buffer.clear();
    batchers.delete(sessionId);
  }

  function scheduleFlush(sessionId: string, batcher: SessionBatcher): void {
    if (batcher.timer) return;
    batcher.timer = setTimeout(() => flushSessionBatcher(sessionId), BATCH_WINDOW_MS);
  }

  /**
   * Enqueue a text content/thought chunk for batched processing.
   * Non-text blocks must be applied directly after calling flushSessionBatcher(sessionId) first
   * to preserve message ordering.
   */
  function enqueueTextChunk(
    sessionId: string,
    messageId: string,
    role: 'agent' | 'user',
    batchType: 'content' | 'thought',
    text: string,
  ): void {
    let batcher = batchers.get(sessionId);
    if (!batcher) {
      batcher = { buffer: new Map(), timer: null };
      batchers.set(sessionId, batcher);
    }
    const key = makeBatchKey(messageId, role, batchType);
    const existing = batcher.buffer.get(key);
    if (existing) {
      existing.mergedText += text;
    } else {
      batcher.buffer.set(key, { messageId, role, batchType, mergedText: text });
    }
    scheduleFlush(sessionId, batcher);
  }

  /** Teardown：冲掉所有 session 的待处理文本（防丢失）并清空 timer（防泄漏/串扰）。 */
  function destroyAllBatchers(): void {
    for (const sessionId of [...batchers.keys()]) {
      flushSessionBatcher(sessionId);
    }
    batchers.clear();
  }

  function resolveMsgId(sessionId: string, role: string, messageId?: string): string {
    // 如果 chunk 自带 messageId，直接使用并更新缓存
    if (messageId) {
      if (!lastMsgIdBySession.has(sessionId)) lastMsgIdBySession.set(sessionId, {});
      lastMsgIdBySession.get(sessionId)![role] = messageId;
      return messageId;
    }

    // 尝试从缓存复用
    const tracked = lastMsgIdBySession.get(sessionId)?.[role];
    if (tracked) return tracked;

    // 缓存中没有，生成新 ID 并缓存
    const newId = generateMsgId();
    if (!lastMsgIdBySession.has(sessionId)) lastMsgIdBySession.set(sessionId, {});
    lastMsgIdBySession.get(sessionId)![role] = newId;
    return newId;
  }

  function clearMsgIdCache(sessionId: string, ...roles: string[]) {
    const cache = lastMsgIdBySession.get(sessionId);
    if (!cache) return;
    for (const role of roles) delete cache[role];
    if (Object.keys(cache).length === 0) lastMsgIdBySession.delete(sessionId);
  }

  const unsubSession = client.onSessionUpdate((notification) => {
    const { sessionId, update } = notification;
    const store = sessionStore.getState();
    store.ensureSession(sessionId);

    switch (update.sessionUpdate) {
      case 'agent_message_chunk':
        // agent 消息打断 user/thought 的连续性
        clearMsgIdCache(sessionId, 'user', 'thought');
        if ('content' in update && update.content) {
          const msgId = resolveMsgId(sessionId, 'agent', (update as { messageId?: string }).messageId);
          if (isTextBlock(update.content)) {
            enqueueTextChunk(sessionId, msgId, 'agent', 'content', update.content.text);
          } else {
            // Non-text block (e.g. tool_use, tool_result) — flush batched text first
            flushSessionBatcher(sessionId);
            store.appendContent(sessionId, msgId, 'agent', update.content);
          }
        }
        break;
      case 'user_message_chunk':
        // user 消息打断 agent/thought 的连续性
        clearMsgIdCache(sessionId, 'agent', 'thought');
        if ('content' in update && update.content) {
          const msgId = resolveMsgId(sessionId, 'user', (update as { messageId?: string }).messageId);
          if (isTextBlock(update.content)) {
            enqueueTextChunk(sessionId, msgId, 'user', 'content', update.content.text);
          } else {
            flushSessionBatcher(sessionId);
            store.appendContent(sessionId, msgId, 'user', update.content);
          }
        }
        break;
      case 'agent_thought_chunk':
        // thought 消息打断 user/agent 的连续性
        clearMsgIdCache(sessionId, 'user', 'agent');
        if ('content' in update && update.content) {
          const msgId = resolveMsgId(sessionId, 'thought', (update as { messageId?: string }).messageId);
          if (isTextBlock(update.content)) {
            enqueueTextChunk(sessionId, msgId, 'agent', 'thought', update.content.text);
          } else {
            flushSessionBatcher(sessionId);
            store.appendThought(sessionId, msgId, 'agent', update.content);
          }
        }
        break;
      case 'tool_call':
        // Flush any batched text chunks before processing tool call (ordering)
        flushSessionBatcher(sessionId);
        // 打断所有角色的连续性
        clearMsgIdCache(sessionId, 'user', 'agent', 'thought');
        store.upsertToolCall(sessionId, {
          toolCallId: update.toolCallId,
          title: update.title,
          content: update.content || [],
          locations: update.locations,
          status: update.status,
          kind: update.kind,
          rawInput: update.rawInput,
          rawOutput: update.rawOutput,
        });
        break;
      case 'tool_call_update':
        // Flush any batched text chunks before processing tool call update (ordering)
        flushSessionBatcher(sessionId);
        // 打断所有角色的连续性
        clearMsgIdCache(sessionId, 'user', 'agent', 'thought');
        {
          const updateData: Record<string, unknown> = {};
          if (update.content !== undefined) updateData['content'] = update.content;
          if (update.status !== undefined) updateData['status'] = update.status;
          if (update.rawOutput !== undefined) updateData['rawOutput'] = update.rawOutput;
          if (update.title) updateData['title'] = update.title;
          if (update.locations !== undefined) updateData['locations'] = update.locations;
          if (update.kind !== undefined) updateData['kind'] = update.kind;
          if (update.rawInput !== undefined) updateData['rawInput'] = update.rawInput;
          store.updateToolCall(sessionId, update.toolCallId, updateData as Partial<ToolCallState>);
        }
        break;
      case 'plan':
        // Flush any batched text chunks before processing plan (ordering)
        flushSessionBatcher(sessionId);
        // 打断所有角色的连续性
        clearMsgIdCache(sessionId, 'user', 'agent', 'thought');
        store.setPlan(sessionId, update.entries);
        break;
      case 'session_info_update': {
        const patch: Record<string, string | undefined> = {};
        if ('title' in update) patch.title = update.title ?? undefined;
        if ('updatedAt' in update) patch.updatedAt = update.updatedAt ?? undefined;
        acpStore.getState().updateSession(sessionId, patch);
        break;
      }
      case 'usage_update':
        store.setUsage(sessionId, update);
        break;
      case 'config_option_update':
        store.setConfigOptions(sessionId, update.configOptions);
        break;
      case 'available_commands_update':
        store.setAvailableCommands(sessionId, update.availableCommands);
        break;
    }
  });

  return () => {
    unsubSession();
    destroyAllBatchers();
  };
}

function buildCapabilities(
  clientCapabilities: ClientCapabilities | undefined,
): ClientCapabilities | undefined {
  return clientCapabilities;
}

export function createAcpProvider(
  options: MultiAgentProviderOptions,
  stdioFactory: StdioTransportFactory | null = null,
): MultiAgentProviderInstance {
  const { agents = [] } = options;
  const scopedClientRegistry = new Map<string, AcpClient>();
  const scopedCleanupFns = new Map<string, () => void>();
  let permissionIdCounter = 0;

  function scopedSetupPermissionHandler(client: AcpClient): () => void {
    // Sessions for which THIS client currently has a pending permission
    // request, so `onClose` can reject exactly its own outstanding requests
    // without scanning every session in the store.
    const pendingPermissionSessions = new Set<string>();

    client.setPermissionHandler((req) => {
      const sessStore = sessionStore.getState();
      return new Promise<RequestPermissionResponse>((resolve) => {
        let settled = false;
        const permissionReq: PermissionRequest = {
          id: `perm_${++permissionIdCounter}`,
          sessionId: req.sessionId,
          toolCall: req.toolCall,
          options: req.options,
          resolve: (optionId: string) => {
            if (settled) return;
            settled = true;
            resolve({ outcome: { outcome: 'selected', optionId } });
          },
          reject: () => {
            if (settled) return;
            settled = true;
            resolve({ outcome: { outcome: 'cancelled' } });
          },
        };
        sessStore.ensureSession(req.sessionId);
        sessStore.addPermissionRequest(req.sessionId, permissionReq);
        pendingPermissionSessions.add(req.sessionId);
      });
    });

    // When the agent connection drops (process died, transport closed, …) any
    // permission request still awaiting a user response can NEVER be answered —
    // the SDK aborts the inbound `session/request_permission` responder on
    // close. Reject those Promises now (→ `cancelled` outcome) and clear them
    // from the store so neither the Promise nor the stale dialog leaks. Without
    // this, the Promise pins the SDK responder forever and the dialog persists.
    const unsubClose = client.onClose(() => {
      const sessStore = sessionStore.getState();
      for (const sid of pendingPermissionSessions) {
        sessStore.rejectAllPermissions(sid);
      }
      pendingPermissionSessions.clear();
    });

    return unsubClose;
  }

  async function connectAgent(config: AgentConfig): Promise<void> {
    const client = new AcpClient();

    // Inject the host stdio transport factory before connecting so `{ type:
    // 'stdio' }` configs resolve against the host's spawn capability. A null
    // factory (web host) leaves stdio configs to fail fast in createTransport.
    client.setStdioTransportFactory(stdioFactory);

    // Register client immediately so getClient works during connection
    scopedClientRegistry.set(config.id, client);

    // Status handler
    const unsubStatus = client.onStatusChange((status) => {
      acpStore.getState().updateAgent(config.id, { status });
    });

    // Session update handler
    const unsubSession = setupSessionUpdateHandler(client);

    // Permission handler (also wires the `onClose` reject-all cleanup)
    const unsubPermission = scopedSetupPermissionHandler(client);

    scopedCleanupFns.set(config.id, () => {
      unsubStatus();
      unsubSession();
      unsubPermission();
    });

    // Connect and initialize
    await client.connect(config.transport);
    const mergedCaps = buildCapabilities(config.clientCapabilities);
    const initRes = await client.initialize(config.clientInfo, mergedCaps);

    acpStore.getState().updateAgent(config.id, {
      agentInfo: client.agentInfo,
      capabilities: client.capabilities,
      status: 'connected',
      authMethods: initRes.authMethods ?? [],
    });

    console.log(`Agent ${config.id} connected successfully.`);
  }

  let ready = false;
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const fn of listeners) fn();
  }

  // Auto-refresh sessions when new workspaces are added
  const knownCwds = new Set<string>();

  function refreshWorkspaceSessions(cwd: string): void {
    const ws = acpStore.getState().workspaces.get(cwd);
    for (const [agentId, client] of scopedClientRegistry) {
      if (!client.capabilities?.sessionCapabilities?.list) continue;
      // Skip if this workspace already has sessions for this agent
      if (ws) {
        let hasSessions = false;
        for (const s of ws.sessions.values()) {
          if (s.agentId === agentId) {
            hasSessions = true;
            break;
          }
        }
        if (hasSessions) continue;
      }
      client.listSessions(undefined, cwd).then((res) => {
        acpStore.getState().setSessions(res.sessions, agentId, cwd);
        if (res.nextCursor) {
          acpStore.getState().appendSessions([], agentId, cwd, res.nextCursor);
        }
      }).catch(() => { });
    }
  }

  // Register all agents in store and connect them in parallel
  for (const config of agents) {
    acpStore.getState().addAgent({
      id: config.id,
      name: config.name,
      status: 'connecting',
      agentInfo: null,
      capabilities: null,
      authMethods: [],
    });
  }

  // Connect all agents
  Promise.allSettled(agents.map((config) =>
    connectAgent(config).catch((err) => {
      console.error(`Agent ${config.id} connection failed:`, err);
      acpStore.getState().updateAgent(config.id, { status: 'error' });
    })
  )).then(() => {
    ready = true;
    notify();
    // Refresh sessions for all existing workspaces once agents are connected
    for (const cwd of knownCwds) {
      refreshWorkspaceSessions(cwd);
    }
  }).catch((err) => {
    console.error('Error during agents connection:', err);
  });

  const unsubWorkspace = acpStore.subscribe((state) => {
    // Detect newly added workspaces
    for (const [cwd] of state.workspaces) {
      if (!knownCwds.has(cwd)) {
        knownCwds.add(cwd);
        if (ready) {
          refreshWorkspaceSessions(cwd);
        }
      }
    }
    // Detect removed workspaces
    for (const cwd of knownCwds) {
      if (!state.workspaces.has(cwd)) {
        knownCwds.delete(cwd);
      }
    }
  });

  async function addAgent(config: AgentConfig): Promise<void> {
    acpStore.getState().addAgent({
      id: config.id,
      name: config.name,
      status: 'connecting',
      agentInfo: null,
      capabilities: null,
      authMethods: [],
    });

    await connectAgent(config);

    // A newly-connected agent may own sessions in workspaces that already
    // exist — the initial batch refresh (run once after the prop agents
    // connected) and the per-workspace refresh (run when a workspace is
    // added) both predate this agent, so its sessions for existing
    // workspaces would otherwise never load. Mirror that refresh here for
    // every known workspace, scoped to just this agent (the per-cwd helper
    // iterates all agents, but its "skip if this agent already has sessions
    // in this workspace" guard makes it a no-op for the already-loaded ones).
    const client = scopedClientRegistry.get(config.id);
    if (client?.capabilities?.sessionCapabilities?.list) {
      for (const cwd of knownCwds) {
        client.listSessions(undefined, cwd).then((res) => {
          acpStore.getState().setSessions(res.sessions, config.id, cwd);
          if (res.nextCursor) {
            acpStore.getState().appendSessions([], config.id, cwd, res.nextCursor);
          }
        }).catch((err) => {
          console.error(`Agent ${config.id} session list failed for ${cwd}:`, err);
        });
      }
    }
  }

  async function removeAgent(agentId: string): Promise<void> {
    const client = scopedClientRegistry.get(agentId);
    if (client) {
      client.disconnect();
      scopedClientRegistry.delete(agentId);
    }

    const cleanup = scopedCleanupFns.get(agentId);
    if (cleanup) {
      cleanup();
      scopedCleanupFns.delete(agentId);
    }

    acpStore.getState().removeAgent(agentId);
    // The agent's skill catalog (skillStore.skillsByAgent) is per-agent and
    // not cleaned by acpStore.removeAgent — drop it here so the Map doesn't
    // grow unbounded as agents are added and removed over time.
    skillStore.getState().removeAgentSkills(agentId);
  }

  return {
    get ready() { return ready; },
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    destroy() {
      unsubWorkspace();
      for (const [, cleanup] of scopedCleanupFns) cleanup();
      scopedCleanupFns.clear();
      for (const [, client] of scopedClientRegistry) client.disconnect();
      scopedClientRegistry.clear();
      listeners.clear();
      // handlers 自动随闭包释放，无需手动清空
    },
    getClient: (agentId: string) => scopedClientRegistry.get(agentId) ?? null,
    addAgent,
    removeAgent,
  };
}
