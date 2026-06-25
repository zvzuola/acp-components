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
  PlanEntry,
  AuthMethod,
  AvailableCommand,
  PromptResponse,
  UsageUpdate,
  SessionConfigOption,
  PromptCapabilities,
  SessionConfigSelectOptions,
  SessionConfigSelectGroup,
  AuthMethodEnvVar,
  ToolCallLocation,
  ToolKind,
} from '@agentclientprotocol/sdk';
export { RequestError } from '@agentclientprotocol/sdk';
import type { AcpTransport } from '../transport/types';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type MessagePart =
  | { type: 'content'; content: ContentBlock[] }
  | { type: 'thought'; thought: ContentBlock[]; expanded?: boolean }
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
  /** UI-only expanded state — not sent over the wire */
  expanded?: boolean;
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
  capabilities: AgentCapabilities | null;
  authMethods: AuthMethod[];
}

export interface WorkspaceState {
  cwd: string;
  label?: string;
  sessions: Map<SessionId, SessionMeta>;
  sessionListCursors: Map<string, string>;
}

export interface PermissionRequest {
  id: string;
  sessionId: SessionId;
  toolCall: ToolCallUpdate;
  options: Array<PermissionOption>;
  resolve: (optionId: string) => void;
  reject: () => void;
}

export interface FileTreeNode {
  name: string;
  path: string;
  kind: 'file' | 'directory';
  children?: FileTreeNode[];
  /** Managed by fileTreeStore: whether this directory is expanded */
  expanded?: boolean;
  /** Managed by fileTreeStore: whether children have been loaded */
  loaded?: boolean;
  /** Platform-specific metadata (size, modified time, git status, etc.) */
  meta?: Record<string, unknown>;
}

/** Signature for a host-provided directory reader */
export type DirectoryReadHandler = (path: string) => Promise<FileTreeNode[]>;

/** Callbacks provided to the file watcher for reporting changes */
export interface FileTreeWatchCallbacks {
  /** Notify that a specific directory's contents changed */
  onDirectoryChanged: (cwd: string, dirPath: string) => void;
  /** Notify that an entire workspace needs refresh */
  onWorkspaceChanged: (cwd: string) => void;
}

// ---------------------------------------------------------------------------
// Platform abstraction — atomic types consumed by the react-layer `Platform`
// interface (defined in `@acp-components/react`). core itself does not depend
// on React nor implement `Platform`; it only owns the shared primitive types
// so the interface and each host factory can compose them.
// ---------------------------------------------------------------------------

/** Host runtime kind */
export type PlatformKind = 'desktop' | 'web';

/** Operating system hint; `undefined` when the host cannot determine it */
export type PlatformOS = 'macos' | 'windows' | 'linux' | undefined;

/**
 * Async key-value storage. web wraps `localStorage`; tauri can back it with a
 * shell command or a settings file. `getItemSync` is optional and only used by
 * callers that need a synchronous read during React initialization (e.g.
 * locale detection); hosts that cannot provide it leave it undefined and
 * callers fall back to their own synchronous path.
 */
export interface AsyncStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  /** Optional synchronous read for init-time lookups; may be omitted. */
  getItemSync?(key: string): string | null;
}

/** Lifecycle status of an auto-updater */
export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'ready'
  | 'error';

/** Snapshot of the auto-updater's current state */
export interface UpdaterState {
  status: UpdaterStatus;
  /** Version available/installed, when known */
  version?: string;
  /** Error message when `status === 'error'` */
  error?: string;
  /** Download/install progress in the range 0..1, when applicable */
  progress?: number;
}

export type { ContentBlock, SessionId, SessionInfo, SessionUpdate, StopReason, ToolCall, ToolCallUpdate, ToolCallContent, Implementation, AgentCapabilities, PermissionOption, ClientCapabilities, PlanEntry, AuthMethod, AvailableCommand, PromptResponse, UsageUpdate, SessionConfigOption, PromptCapabilities, SessionConfigSelectOptions, SessionConfigSelectGroup, AuthMethodEnvVar, ToolCallLocation, ToolKind };
