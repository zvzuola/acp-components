export { AcpClient } from './client/AcpClient';
export type { FileReadHandler, FileWriteHandler, SessionUpdateHandler, PermissionHandler, ExtMethodHandler, ExtNotificationHandler } from './client/AcpClient';
export { StdioTransport, HttpTransport, WebSocketTransport } from './transport';
export type { AcpTransport, Stream, AnyMessage } from './transport';
export { acpStore } from './store/acpStore';
export { sessionStore } from './store/sessionStore';
export { fileTreeStore, findNodeByPath } from './store/fileTreeStore';
export type { WorkspaceFileTreeState } from './store/fileTreeStore';
export { createAcpProvider } from './provider';
export type { MultiAgentProviderOptions, MultiAgentProviderInstance } from './provider';
export { createFileSystemProvider } from './fileSystem/provider';
export type { FileSystemProviderOptions, FileSystemProviderInstance } from './fileSystem/provider';
export { createSession, loadSession, selectSession, closeSession, refreshSessions, loadMoreSessions, setSessionConfigOption, authenticate, authenticateWithEnv } from './actions/sessions';
export { sendPrompt, cancelPrompt } from './actions/prompt';
export { respondToPermission, denyPermission } from './actions/permission';
export { callExtMethod, sendExtNotification } from './actions/extensions';
export { loadFileTree, expandDirectory, collapseDirectory, refreshFileTree, refreshNode } from './actions/fileTree';
export type {
  ConnectionStatus,
  Session,
  Message,
  MessagePart,
  ToolCallState,
  AcpClientConfig,
  TransportConfig,
  PermissionRequest,
  SessionMeta,
  AgentConfig,
  AgentConnection,
  WorkspaceState,
  Implementation,
  TerminalState,
  TerminalHandle,
  TerminalHandler,
  FileTreeNode,
  DirectoryReadHandler,
  FileTreeWatchCallbacks,
} from './types';
export type { ContentBlock, SessionId, SessionInfo, StopReason, ToolCall, ToolCallUpdate, ToolCallContent, AgentCapabilities, SessionUpdate, ClientCapabilities, CreateTerminalRequest, TerminalOutputResponse, WaitForTerminalExitResponse, TerminalExitStatus } from './types';
