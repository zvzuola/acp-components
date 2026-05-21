import type {
  ContentBlock,
  SessionId,
  SessionInfo,
  StopReason,
  ToolCall,
  ToolCallUpdate,
  ToolCallContent,
  Implementation,
  AgentCapabilities,
  SessionUpdate,
  PermissionOption,
  ClientCapabilities,
  CreateTerminalRequest,
  TerminalOutputResponse,
  WaitForTerminalExitResponse,
  TerminalExitStatus,
  PlanEntry,
} from '@agentclientprotocol/sdk';
import type { AcpTransport } from '../transport/types';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type MessagePart =
  | { type: 'content'; content: ContentBlock[] }
  | { type: 'thought'; thought: ContentBlock[] }
  | { type: 'tool_calls'; toolCalls: ToolCallState[] }
  | { type: 'plan'; plan: PlanEntry[] };

export interface Message {
  id: string;
  role: 'user' | 'agent' | 'system';
  parts: MessagePart[];
  timestamp: number;
  stopReason?: StopReason;
}

export interface ToolCallState extends ToolCall {
}

export interface Session extends SessionInfo {
  messages: Message[];
  isStreaming: boolean;
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
  agentId: string;
  loaded: boolean;
}

export interface AgentConfig {
  id: string;
  name: string;
  transport: TransportConfig;
  clientInfo?: Implementation;
  clientCapabilities?: ClientCapabilities;
}

export interface AgentConnection {
  id: string;
  name: string;
  status: ConnectionStatus;
  agentInfo: Implementation | null;
  capabilities: Record<string, unknown> | null;
}

export interface WorkspaceState {
  cwd: string;
  label?: string;
  activeSessionId: SessionId | null;
  sessions: Map<SessionId, SessionMeta>;
}

export interface PermissionRequest {
  id: string;
  sessionId: SessionId;
  toolCall: ToolCallUpdate;
  options: Array<PermissionOption>;
  resolve: (optionId: string) => void;
  reject: () => void;
}

export interface TerminalState {
  terminalId: string;
  command: string;
  args?: string[];
  cwd?: string | null;
  output: string;
  exitStatus: TerminalExitStatus | null;
  truncated: boolean;
}

export interface TerminalHandle {
  readonly terminalId: string;
  getOutput(): Promise<TerminalOutputResponse>;
  waitForExit(): Promise<WaitForTerminalExitResponse>;
  kill(): Promise<void>;
  release(): Promise<void>;
  onOutputChange(fn: (output: string) => void): () => void;
  onExit(fn: (status: TerminalExitStatus | null) => void): () => void;
}

export interface TerminalHandler {
  create(params: CreateTerminalRequest): Promise<TerminalHandle>;
}

export type { ContentBlock, SessionId, SessionInfo, SessionUpdate, StopReason, ToolCall, ToolCallUpdate, ToolCallContent, Implementation, AgentCapabilities, PermissionOption, ClientCapabilities, CreateTerminalRequest, TerminalOutputResponse, WaitForTerminalExitResponse, TerminalExitStatus, PlanEntry };
