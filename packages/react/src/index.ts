import './styles.css';

export { AcpProvider } from './components/workbench';
export type { AcpProviderProps } from './components/workbench/AcpProvider';
export { Workbench } from './components/workbench';
export type { WorkbenchProps } from './components/workbench/Workbench';
export { SessionList } from './components/session-list';
export { ChatView, MessageBubble, ChatComposer, ToolCallCard, StreamingIndicator, ModelSelector } from './components/chat-view';
export type { ChatViewProps } from './components/chat-view/ChatView';
export type { MessageBubbleProps } from './components/chat-view/MessageBubble';
export type { ChatComposerProps } from './components/chat-view/ChatComposer';
export type { ToolCallCardProps } from './components/chat-view/ToolCallCard';
export type { ModelSelectorProps } from './components/chat-view/ModelSelector';
export { DiffView } from './components/diff-view';
export type { DiffViewProps } from './components/diff-view/DiffView';
export { PermissionDialog } from './components/permission-dialog';
export type { PermissionDialogProps } from './components/permission-dialog/PermissionDialog';
export { ConnectionStatus, SessionModeSelector } from './components/status-bar';
export type { SessionModeSelectorProps } from './components/status-bar/SessionModeSelector';
export { TerminalView } from './components/terminal-view';
export type { TerminalViewProps } from './components/terminal-view/TerminalView';

// Re-export core hooks for convenience
export {
  useSessions,
  useSession,
  usePrompt,
  useToolCalls,
  usePermission,
  useConnectionStatus,
  useAcpContext,
  useAcpStore,
  useSessionStore,
  AcpContext,
} from '@acp-components/core';
export type {
  Session,
  Message,
  ToolCallState,
  TransportConfig,
  PermissionRequest,
} from '@acp-components/core';
export type { ConnectionStatus as ConnectionStatusType } from '@acp-components/core';
