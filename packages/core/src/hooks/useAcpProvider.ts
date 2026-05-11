import { useEffect, useRef, useState } from 'react';
import { AcpClient } from '../client/AcpClient';
import type { FileReadHandler, FileWriteHandler } from '../client/AcpClient';
import { useAcpStore } from '../store/acpStore';
import { useSessionStore } from '../store/sessionStore';
import type { TransportConfig, Implementation, ToolCallState, PermissionRequest } from '../types';
import type { RequestPermissionResponse, ClientCapabilities } from '@agentclientprotocol/sdk';

let globalClient: AcpClient | null = null;

export function getAcpClient(): AcpClient | null {
  return globalClient;
}

interface UseAcpProviderOptions {
  transport: TransportConfig;
  clientInfo?: Implementation;
  clientCapabilities?: ClientCapabilities;
  onFileRead?: FileReadHandler;
  onFileWrite?: FileWriteHandler;
}

export function useAcpProvider({ transport, clientInfo, clientCapabilities, onFileRead, onFileWrite }: UseAcpProviderOptions) {
  const clientRef = useRef<AcpClient>(globalClient ?? new AcpClient());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const client = clientRef.current;
    globalClient = client;

    const unsubStatus = client.onStatusChange((status) => {
      useAcpStore.getState().setConnectionStatus(status);
    });

    const unsubUpdate = client.onSessionUpdate((notification) => {
      const { sessionId, update } = notification;
      const store = useSessionStore.getState();
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
        case 'current_mode_update':
          store.setCurrentMode(sessionId, update.currentModeId);
          break;
        case 'session_info_update':
          if (update.title) {
            useAcpStore.getState().updateSession(sessionId, { title: update.title });
          }
          break;
      }
    });

    client.setPermissionHandler((req) => {
      const sessionStore = useSessionStore.getState();
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
        sessionStore.ensureSession(req.sessionId);
        sessionStore.addPermissionRequest(req.sessionId, permissionReq);
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
      const caps = client.capabilities;
      useAcpStore.getState().setAgentInfo(client.agentInfo);
      setReady(true);
      if (caps?.sessionCapabilities) {
        const sessionCaps = caps.sessionCapabilities as Record<string, unknown>;
        if (sessionCaps.list) {
          client.listSessions().then((res) => {
            const acpStore = useAcpStore.getState();
            const sessionStore = useSessionStore.getState();
            acpStore.setSessions(res.sessions);
            for (const s of res.sessions) {
              sessionStore.ensureSession(s.sessionId);
            }
          }).catch(() => { });
        }
      }
    }).catch((err) => {
      console.error('ACP connection failed:', err);
    });

    return () => {
      unsubStatus();
      unsubUpdate();
      client.disconnect();
      globalClient = null;
    };
  }, []);

  return {
    client: clientRef.current,
    ready,
    config: transport,
    clientInfo,
  };
}
