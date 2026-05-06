import type {
  ContentBlock,
  SessionId,
  SessionInfo,
  SessionMode,
  SessionModeId,
  StopReason,
  ToolCall,
  ToolCallUpdate,
  ToolCallContent,
  Implementation,
  AgentCapabilities,
  SessionUpdate,
  PermissionOption,
} from '@agentclientprotocol/sdk';
import type { AcpTransport } from '../transport/types';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface Message {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: ContentBlock[];
  thought?: ContentBlock[];
  timestamp: number;
  toolCalls?: ToolCallState[];
  stopReason?: StopReason;
}

export interface ToolCallState extends ToolCall {
}

export interface Session extends SessionInfo {
  messages: Message[];
  isStreaming: boolean;
  currentModeId?: SessionModeId;
  availableModes?: SessionMode[];
}

export interface AcpClientConfig {
  transport: TransportConfig;
  clientInfo?: Implementation;
}

export type TransportConfig =
  | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
  | { type: 'http'; url: string; headers?: Record<string, string> }
  | { type: 'websocket'; url: string }
  | { type: 'custom'; transport: AcpTransport };

export interface SessionMeta {
  id: SessionId;
  title?: string;
  cwd: string;
  updatedAt?: string;
}

export interface PermissionRequest {
  sessionId: SessionId;
  toolCall: ToolCallUpdate;
  options: Array<PermissionOption>;
  resolve: (optionId: string) => void;
  reject: () => void;
}

export type { ContentBlock, SessionId, SessionInfo, SessionUpdate, StopReason, ToolCall, ToolCallUpdate, ToolCallContent, Implementation, AgentCapabilities, PermissionOption };
