import { AcpClient } from './client/AcpClient';
import type { FileReadHandler, FileWriteHandler, ExtMethodHandler, ExtNotificationHandler } from './client/AcpClient';
import { acpStore } from './store/acpStore';
import { sessionStore } from './store/sessionStore';
import type { ToolCallState, TerminalHandler, TerminalState } from './types';
import type { AgentConfig } from './types';
import type { RequestPermissionResponse, ClientCapabilities, CreateTerminalRequest, TerminalExitStatus } from '@agentclientprotocol/sdk';
import type { PermissionRequest } from './types';

function generateMsgId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface MultiAgentProviderOptions {
  agents: AgentConfig[];
  onFileRead?: FileReadHandler;
  onFileWrite?: FileWriteHandler;
  onTerminal?: TerminalHandler;
  onExtMethod?: ExtMethodHandler;
  onExtNotification?: ExtNotificationHandler;
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

  return client.onSessionUpdate((notification) => {
    const { sessionId, update } = notification;
    const store = sessionStore.getState();
    store.ensureSession(sessionId);

    switch (update.sessionUpdate) {
      case 'agent_message_chunk':
        // agent 消息打断 user/thought 的连续性
        clearMsgIdCache(sessionId, 'user', 'thought');
        if ('content' in update && update.content) {
          const msgId = resolveMsgId(sessionId, 'agent', (update as { messageId?: string }).messageId);
          store.appendContent(sessionId, msgId, 'agent', update.content);
        }
        break;
      case 'user_message_chunk':
        // user 消息打断 agent/thought 的连续性
        clearMsgIdCache(sessionId, 'agent', 'thought');
        if ('content' in update && update.content) {
          const msgId = resolveMsgId(sessionId, 'user', (update as { messageId?: string }).messageId);
          store.appendContent(sessionId, msgId, 'user', update.content);
        }
        break;
      case 'agent_thought_chunk':
        // thought 消息打断 user/agent 的连续性
        clearMsgIdCache(sessionId, 'user', 'agent');
        if ('content' in update && update.content) {
          const msgId = resolveMsgId(sessionId, 'thought', (update as { messageId?: string }).messageId);
          store.appendThought(sessionId, msgId, 'agent', update.content);
        }
        break;
      case 'tool_call':
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
}

function buildCapabilities(
  clientCapabilities: ClientCapabilities | undefined,
  fileReadHandler: FileReadHandler | undefined,
  fileWriteHandler: FileWriteHandler | undefined,
  terminalHandler: TerminalHandler | undefined,
): ClientCapabilities | undefined {
  const caps: ClientCapabilities = {
    ...clientCapabilities,
    fs: {
      ...clientCapabilities?.fs,
      ...(fileReadHandler ? { readTextFile: true } : {}),
      ...(fileWriteHandler ? { writeTextFile: true } : {}),
    },
    ...(terminalHandler ? { terminal: true } : {}),
    auth: {
      ...clientCapabilities?.auth,
      ...(terminalHandler ? { terminal: true } : {}),
    },
  };
  const hasFsCaps = caps.fs?.readTextFile || caps.fs?.writeTextFile;
  return hasFsCaps || caps.terminal || caps.auth?.terminal ? caps : undefined;
}

export function createAcpProvider({ agents, onFileRead, onFileWrite, onTerminal, onExtMethod, onExtNotification }: MultiAgentProviderOptions): MultiAgentProviderInstance {
  // Scoped state — each provider instance has its own isolated handlers and registries
  const scopedFileReadHandler = onFileRead;
  const scopedFileWriteHandler = onFileWrite;
  const scopedTerminalHandler = onTerminal;
  const scopedExtMethodHandler = onExtMethod;
  const scopedExtNotificationHandler = onExtNotification;
  const scopedClientRegistry = new Map<string, AcpClient>();
  const scopedCleanupFns = new Map<string, () => void>();
  let permissionIdCounter = 0;

  function scopedSetupPermissionHandler(client: AcpClient): void {
    client.setPermissionHandler((req) => {
      const sessStore = sessionStore.getState();
      return new Promise<RequestPermissionResponse>((resolve) => {
        const permissionReq: PermissionRequest = {
          id: `perm_${++permissionIdCounter}`,
          sessionId: req.sessionId,
          toolCall: req.toolCall,
          options: req.options,
          resolve: (optionId: string) => {
            resolve({ outcome: { outcome: 'selected', optionId } });
          },
          reject: () => {
            resolve({ outcome: { outcome: 'cancelled' } });
          },
        };
        sessStore.ensureSession(req.sessionId);
        sessStore.addPermissionRequest(req.sessionId, permissionReq);
      });
    });
  }

  async function connectAgent(config: AgentConfig): Promise<void> {
    const client = new AcpClient();

    // Register client immediately so getClient works during connection
    scopedClientRegistry.set(config.id, client);

    // Status handler
    const unsubStatus = client.onStatusChange((status) => {
      acpStore.getState().updateAgent(config.id, { status });
    });

    // Session update handler
    const unsubSession = setupSessionUpdateHandler(client);

    // Permission handler
    scopedSetupPermissionHandler(client);

    // Terminal handler
    if (scopedTerminalHandler) {
      const storeBridge: TerminalHandler = {
        create: async (params: CreateTerminalRequest) => {
          const handle = await scopedTerminalHandler!.create(params);
          const state: TerminalState = {
            terminalId: handle.terminalId,
            command: params.command,
            args: params.args,
            cwd: params.cwd,
            output: '',
            exitStatus: null,
            truncated: false,
          };
          sessionStore.getState().addTerminal(params.sessionId, state);

          handle.onOutputChange((output) => {
            sessionStore.getState().updateTerminalOutput(params.sessionId, handle.terminalId, output, false);
          });

          handle.onExit((exitStatus: TerminalExitStatus | null) => {
            sessionStore.getState().updateTerminalExit(params.sessionId, handle.terminalId, exitStatus);
          });

          return handle;
        },
      };
      client.setTerminalHandler(storeBridge);
    }

    // File handlers
    if (scopedFileReadHandler) {
      client.setFileReadHandler(scopedFileReadHandler);
    }
    if (scopedFileWriteHandler) {
      client.setFileWriteHandler(scopedFileWriteHandler);
    }

    // Extension handlers
    if (scopedExtMethodHandler) {
      client.setExtMethodHandler(scopedExtMethodHandler);
    }
    if (scopedExtNotificationHandler) {
      client.setExtNotificationHandler(scopedExtNotificationHandler);
    }

    scopedCleanupFns.set(config.id, () => {
      unsubStatus();
      unsubSession();
    });

    // Connect and initialize
    await client.connect(config.transport);
    const mergedCaps = buildCapabilities(config.clientCapabilities, scopedFileReadHandler, scopedFileWriteHandler, scopedTerminalHandler);
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
