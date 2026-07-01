import './styles.css';

export { AcpProvider } from './components/workbench';
export type { AcpProviderProps } from './components/workbench/AcpProvider';
export { Workbench } from './components/workbench';
export type { WorkbenchProps } from './components/workbench/Workbench';
export { ResizeHandle } from './components/workbench';
export type { ResizeHandleProps } from './components/workbench/ResizeHandle';
export { SessionList } from './components/session-list';
export type { SessionListProps } from './components/session-list/SessionList';
export { Sidebar } from './components/sidebar';
export type { SidebarProps } from './components/sidebar/Sidebar';
export { Markdown } from './components/markdown';
export type { MarkdownProps } from './components/markdown/Markdown';
export { ChatView, MessageBubble, ChatComposer, ToolCallCard, StreamingIndicator, ThoughtView, PlanView } from './components/chat-view';
export type { ChatViewProps } from './components/chat-view/ChatView';
export type { MessageBubbleProps } from './components/chat-view/MessageBubble';
export type { ChatComposerProps } from './components/chat-view/ChatComposer';
export type { ToolCallCardProps } from './components/chat-view/ToolCallCard';
export type { ThoughtViewProps } from './components/chat-view/ThoughtView';
export type { PlanViewProps } from './components/chat-view/PlanView';
export { DiffView } from './components/diff-view';
export type { DiffViewProps } from './components/diff-view/DiffView';
export { PermissionDialog } from './components/permission-dialog';
export type { PermissionDialogProps } from './components/permission-dialog/PermissionDialog';
export { LoginDialog } from './components/login-dialog';
export { ConnectionStatus, UsageBar } from './components/status-bar';
export type { UsageBarProps } from './components/status-bar/UsageBar';
export { SessionConfigPanel } from './components/session-config-panel';
export type { SessionConfigPanelProps } from './components/session-config-panel/SessionConfigPanel';
export { Select } from './components/select';
export type { SelectProps, SelectOption, SelectOptionGroup } from './components/select';
export { CommandPalette } from './components/command-palette';
export type { CommandPaletteProps } from './components/command-palette/CommandPalette';
export { FileTree } from './components/file-tree';
export type { FileTreeProps, FileTreeNode } from './components/file-tree/FileTree';
export { FileViewer } from './components/file-viewer';
export type { FileViewerProps } from './components/file-viewer/FileViewer';
export { SettingsMenu } from './components/settings-menu/SettingsMenu';
export type { SettingsMenuProps } from './components/settings-menu/SettingsMenu';
export { Dropdown } from './components/dropdown';
export type {
  DropdownProps,
  DropdownTriggerProps,
  DropdownContentProps,
  DropdownSectionProps,
  DropdownItemProps,
  DropdownSubmenuProps,
  DropdownSubmenuItemProps,
} from './components/dropdown';

// Re-export hooks (now defined locally)
export { useAcpProvider } from './hooks/useAcpProvider';
export { useAcpStore } from './hooks/useAcpStore';
export { useSessionStore } from './hooks/useSessionStore';
export { useSessions } from './hooks/useSessions';
export { useSessionMessages, useSessionIsStreaming, useSessionPlan, useSessionAvailableCommands, useSessionPendingToolCalls, useSessionPendingPermissions, useSessionConfigOptions, useSessionUsage } from './hooks/useSession';
export { usePrompt } from './hooks/usePrompt';
export { useToolCalls } from './hooks/useToolCalls';
export { usePermission } from './hooks/usePermission';
export { useConnectionStatus, useAllAgentStatuses } from './hooks/useConnectionStatus';
export { useExtensions } from './hooks/useExtensions';
export { useFileTree } from './hooks/useFileTree';
export { useFileViewer } from './hooks/useFileViewer';
export type { OpenFileEntry, UseFileViewerReturn } from './hooks/useFileViewer';
export { loadWorkspaces, saveWorkspaces } from './components/platform/PlatformWorkspacesAuto';
export { useResizable } from './hooks/useResizable';
export type { UseResizableOptions, UseResizableReturn } from './hooks/useResizable';
export { AcpContext, useAcpContext } from './context/AcpContext';
export type { AcpContextValue } from './context/AcpContext';
export { PlatformContext, usePlatform } from './context/PlatformContext';
export type {
  Platform,
  FileSystem,
  Dialogs,
  OpenExternalEditor,
  PlatformSystem,
  Updater,
  PlatformProviderProps,
} from './context/PlatformContext';
export { PlatformProvider } from './components/platform';
export { useSettings } from './context/SettingsContext';
export type { SettingsContextValue } from './context/SettingsContext';

// Re-export types from core for convenience
export type {
  Session,
  Message,
  ToolCallState,
  TransportConfig,
  PermissionRequest,
  ConnectionStatus as ConnectionStatusType,
  MessagePart,
  AgentConfig,
  AgentConnection,
  WorkspaceState,
  DirectoryReadHandler,
  FileTreeWatchCallbacks,
  FileTreeWatcher,
  PlatformStorage,
  UpdaterState,
  UpdaterStatus,
  PlatformKind,
  PlatformOS,
} from '@acp-components/core';

// i18n
export { I18nProvider, useI18n } from './i18n';
export type { I18nProviderProps } from './i18n';
