import { AcpClient } from './client/AcpClient';
import type { FileReadHandler, FileWriteHandler } from './client/AcpClient';
import { acpStore } from './store/acpStore';
import { sessionStore } from './store/sessionStore';
import type { ToolCallState } from './types';
import type { AgentConfig } from './types';
import type { RequestPermissionResponse, ClientCapabilities } from '@agentclientprotocol/sdk';
import type { PermissionRequest } from './types';

let permissionIdCounter = 0;

const clientRegistry = new Map<string, AcpClient>();
const cleanupFns = new Map<string, () => void>();

let globalFileReadHandler: FileReadHandler | undefined;
let globalFileWriteHandler: FileWriteHandler | undefined;

export function getClient(agentId: string): AcpClient | null {
  return clientRegistry.get(agentId) ?? null;
}

export interface MultiAgentProviderOptions {
  agents: AgentConfig[];
  onFileRead?: FileReadHandler;
  onFileWrite?: FileWriteHandler;
}

export interface MultiAgentProviderInstance {
  ready: boolean;
  subscribe(fn: () => void): () => void;
  destroy(): void;
  getClient(agentId: string): AcpClient | null;
  addAgent(config: AgentConfig): Promise<void>;
  removeAgent(agentId: string): Promise<void>;
}

function setupPermissionHandler(client: AcpClient): void {
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

function setupSessionUpdateHandler(client: AcpClient): () => void {
  return client.onSessionUpdate((notification) => {
    const { sessionId, update } = notification;
    const store = sessionStore.getState();
    store.ensureSession(sessionId);

    switch (update.sessionUpdate) {
      case 'agent_message_chunk':
      case 'user_message_chunk':
        if ('content' in update && update.content) {
          const msgId = (update as { messageId?: string }).messageId ?? 'current';
          const role = update.sessionUpdate === 'user_message_chunk' ? 'user' as const : 'agent' as const;
          store.appendContent(sessionId, msgId, role, update.content);
        }
        break;
      case 'agent_thought_chunk':
        if ('content' in update && update.content) {
          const msgId = (update as { messageId?: string }).messageId ?? 'current';
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
        const updateData: Partial<ToolCallState> = {};
        if (update.content) updateData['content'] = update.content;
        if (update.status) updateData['status'] = update.status;
        if (update.rawOutput) updateData['rawOutput'] = update.rawOutput;
        if (update.title) updateData['title'] = update.title;
        if (update.locations) updateData['locations'] = update.locations;
        if (update.kind) updateData['kind'] = update.kind;
        if (update.rawInput) updateData['rawInput'] = update.rawInput;
        store.updateToolCall(sessionId, update.toolCallId, updateData);
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

function buildCapabilities(clientCapabilities?: ClientCapabilities): ClientCapabilities | undefined {
  const caps: ClientCapabilities = {
    ...clientCapabilities,
    fs: {
      ...clientCapabilities?.fs,
      ...(globalFileReadHandler ? { readTextFile: true } : {}),
      ...(globalFileWriteHandler ? { writeTextFile: true } : {}),
    },
  };
  const hasFsCaps = caps.fs?.readTextFile || caps.fs?.writeTextFile;
  return hasFsCaps || caps.terminal || caps.auth ? caps : undefined;
}

async function connectAgent(config: AgentConfig): Promise<void> {
  const client = new AcpClient();

  // Register client immediately so getClient works during connection
  clientRegistry.set(config.id, client);

  // Status handler
  const unsubStatus = client.onStatusChange((status) => {
    acpStore.getState().updateAgent(config.id, { status });
  });

  // Session update handler
  const unsubSession = setupSessionUpdateHandler(client);

  // Permission handler
  setupPermissionHandler(client);

  // File handlers
  if (globalFileReadHandler) {
    client.setFileReadHandler(globalFileReadHandler);
  }
  if (globalFileWriteHandler) {
    client.setFileWriteHandler(globalFileWriteHandler);
  }

  cleanupFns.set(config.id, () => {
    unsubStatus();
    unsubSession();
  });

  // Connect and initialize
  await client.connect(config.transport);
  const mergedCaps = buildCapabilities(config.clientCapabilities);
  await client.initialize(config.clientInfo, mergedCaps);

  acpStore.getState().updateAgent(config.id, {
    agentInfo: client.agentInfo,
    capabilities: client.capabilities,
    status: 'connected',
  });

  // List sessions if supported
  const agentCaps = client.capabilities;
  if (agentCaps?.sessionCapabilities) {
    const sessionCaps = agentCaps.sessionCapabilities as Record<string, unknown>;
    if (sessionCaps.list) {
      try {
        const res = await client.listSessions();
        acpStore.getState().setSessions(res.sessions, config.id);
        for (const s of res.sessions) {
          sessionStore.getState().ensureSession(s.sessionId);
        }
      } catch {
        // listSessions is optional
      }
    }
  }
}

export function createAcpProvider({ agents, onFileRead, onFileWrite }: MultiAgentProviderOptions): MultiAgentProviderInstance {
  globalFileReadHandler = onFileRead;
  globalFileWriteHandler = onFileWrite;

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
  });

  async function addAgent(config: AgentConfig): Promise<void> {
    acpStore.getState().addAgent({
      id: config.id,
      name: config.name,
      status: 'connecting',
      agentInfo: null,
      capabilities: null,
    });

    await connectAgent(config);
  }

  async function removeAgent(agentId: string): Promise<void> {
    const client = clientRegistry.get(agentId);
    if (client) {
      client.disconnect();
      clientRegistry.delete(agentId);
    }

    const cleanup = cleanupFns.get(agentId);
    if (cleanup) {
      cleanup();
      cleanupFns.delete(agentId);
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
      for (const [, cleanup] of cleanupFns) cleanup();
      cleanupFns.clear();
      for (const [, client] of clientRegistry) client.disconnect();
      clientRegistry.clear();
      listeners.clear();
    },
    getClient: (agentId: string) => clientRegistry.get(agentId) ?? null,
    addAgent,
    removeAgent,
  };
}
