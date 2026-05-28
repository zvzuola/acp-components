import { AcpClient } from './client/AcpClient';
import type { FileReadHandler, FileWriteHandler } from './client/AcpClient';
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
  return client.onSessionUpdate((notification) => {
    const { sessionId, update } = notification;
    const store = sessionStore.getState();
    store.ensureSession(sessionId);

    switch (update.sessionUpdate) {
      case 'agent_message_chunk':
      case 'user_message_chunk':
        if ('content' in update && update.content) {
          const msgId = (update as { messageId?: string }).messageId || generateMsgId();
          const role = update.sessionUpdate === 'user_message_chunk' ? 'user' as const : 'agent' as const;
          store.appendContent(sessionId, msgId, role, update.content);
        }
        break;
      case 'agent_thought_chunk':
        if ('content' in update && update.content) {
          const msgId = (update as { messageId?: string }).messageId || generateMsgId();
          store.appendThought(sessionId, msgId, 'agent', update.content);
        }
        break;
      case 'tool_call':
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
      case 'tool_call_update': {
        const updateData: Record<string, unknown> = {};
        if (update.content !== undefined) updateData['content'] = update.content;
        if (update.status !== undefined) updateData['status'] = update.status;
        if (update.rawOutput !== undefined) updateData['rawOutput'] = update.rawOutput;
        if (update.title !== undefined) updateData['title'] = update.title;
        if (update.locations !== undefined) updateData['locations'] = update.locations;
        if (update.kind !== undefined) updateData['kind'] = update.kind;
        if (update.rawInput !== undefined) updateData['rawInput'] = update.rawInput;
        store.updateToolCall(sessionId, update.toolCallId, updateData as Partial<ToolCallState>);
        break;
      }
      case 'plan':
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
  };
  const hasFsCaps = caps.fs?.readTextFile || caps.fs?.writeTextFile;
  return hasFsCaps || caps.terminal || caps.auth ? caps : undefined;
}

export function createAcpProvider({ agents, onFileRead, onFileWrite, onTerminal }: MultiAgentProviderOptions): MultiAgentProviderInstance {
  // Scoped state — each provider instance has its own isolated handlers and registries
  const scopedFileReadHandler = onFileRead;
  const scopedFileWriteHandler = onFileWrite;
  const scopedTerminalHandler = onTerminal;
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
  }).catch((err) => {
    console.error('Error during agents connection:', err);
  });

  // Auto-refresh sessions when workspace changes (skip if already loaded)
  const unsubWorkspace = acpStore.subscribe((state, prev) => {
    if (!state.activeWorkspaceCwd || state.activeWorkspaceCwd === prev.activeWorkspaceCwd) return;
    const cwd = state.activeWorkspaceCwd;
    const ws = state.workspaces.get(cwd);
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
      }).catch(() => {});
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
