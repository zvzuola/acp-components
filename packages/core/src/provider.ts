import { AcpClient } from './client/AcpClient';
import type { FileReadHandler, FileWriteHandler } from './client/AcpClient';
import { acpStore } from './store/acpStore';
import { sessionStore } from './store/sessionStore';
import type { TransportConfig, Implementation, ToolCallState } from './types';
import type { RequestPermissionResponse, ClientCapabilities } from '@agentclientprotocol/sdk';
import type { PermissionRequest } from './types';

let globalClient: AcpClient | null = null;

export function getAcpClient(): AcpClient | null {
  return globalClient;
}

export interface AcpProviderOptions {
  transport: TransportConfig;
  clientInfo?: Implementation;
  clientCapabilities?: ClientCapabilities;
  onFileRead?: FileReadHandler;
  onFileWrite?: FileWriteHandler;
}

export interface AcpProviderInstance {
  client: AcpClient;
  ready: boolean;
  subscribe(fn: () => void): () => void;
  destroy(): void;
}

export function createAcpProvider({ transport, clientInfo, clientCapabilities, onFileRead, onFileWrite }: AcpProviderOptions): AcpProviderInstance {
  const client = globalClient ?? new AcpClient();
  globalClient = client;

  let ready = false;
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const fn of listeners) fn();
  }

  const unsubStatus = client.onStatusChange((status) => {
    acpStore.getState().setConnectionStatus(status);
  });

  const unsubUpdate = client.onSessionUpdate((notification) => {
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

  client.setPermissionHandler((req) => {
    const sessStore = sessionStore.getState();
    return new Promise<RequestPermissionResponse>((resolve) => {
      const permissionReq: PermissionRequest = {
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

  if (onFileRead) {
    client.setFileReadHandler(onFileRead);
  }
  if (onFileWrite) {
    client.setFileWriteHandler(onFileWrite);
  }

  const caps: ClientCapabilities = {
    ...clientCapabilities,
    fs: {
      ...clientCapabilities?.fs,
      ...(onFileRead ? { readTextFile: true } : {}),
      ...(onFileWrite ? { writeTextFile: true } : {}),
    },
  };
  const hasFsCaps = caps.fs?.readTextFile || caps.fs?.writeTextFile;
  const mergedCaps: ClientCapabilities | undefined = hasFsCaps || caps.terminal || caps.auth
    ? caps
    : undefined;

  client.connect(transport).then(() => {
    console.log('ACP connected');
    return client.initialize(clientInfo, mergedCaps);
  }).then(() => {
    const agentCaps = client.capabilities;
    acpStore.getState().setAgentInfo(client.agentInfo);
    ready = true;
    notify();
    if (agentCaps?.sessionCapabilities) {
      const sessionCaps = agentCaps.sessionCapabilities as Record<string, unknown>;
      if (sessionCaps.list) {
        client.listSessions().then((res) => {
          const acp = acpStore.getState();
          const sess = sessionStore.getState();
          acp.setSessions(res.sessions);
          for (const s of res.sessions) {
            sess.ensureSession(s.sessionId);
          }
        }).catch(() => { });
      }
    }
  }).catch((err) => {
    console.error('ACP connection failed:', err);
  });

  return {
    client,
    get ready() { return ready; },
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    destroy() {
      unsubStatus();
      unsubUpdate();
      client.disconnect();
      globalClient = null;
      listeners.clear();
    },
  };
}
