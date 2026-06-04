import React, { useMemo } from 'react';
import { AcpContext } from '../../context/AcpContext';
import { useAcpProvider } from '../../hooks/useAcpProvider';
import { useFileSystemProvider } from '../../hooks/useFileSystemProvider';
import { acpStore } from '@acp-components/core';
import type { AgentConfig, TerminalHandler, FileSystemProviderOptions } from '@acp-components/core';
import type { ExtMethodHandler, ExtNotificationHandler } from '@acp-components/core';
import { useI18n } from '../../i18n';
import styles from './loading.module.scss';

export interface AcpProviderProps {
  agents: AgentConfig[];
  theme?: 'light' | 'dark';
  children: React.ReactNode;
  onTerminal?: TerminalHandler;
  onExtMethod?: ExtMethodHandler;
  onExtNotification?: ExtNotificationHandler;
  defaultCwd?: string;
  /** Unified file system options: file tree browsing + ACP file read/write handlers */
  fileSystem?: FileSystemProviderOptions;
  /** Host-provided file open handler. When set, built-in FileViewer is bypassed — host opens the file in its own editor. */
  onOpenFile?: (path: string, line?: number | null) => void;
}

function FileSystemProviderWrapper({ options, children }: { options: FileSystemProviderOptions; children: React.ReactNode }) {
  useFileSystemProvider(options);
  return <>{children}</>;
}

export function AcpProvider({
  agents,
  theme = 'dark',
  children,
  onTerminal,
  onExtMethod,
  onExtNotification,
  defaultCwd = '',
  fileSystem,
  onOpenFile,
}: AcpProviderProps) {
  const provider = useAcpProvider({
    agents,
    onTerminal,
    onExtMethod,
    onExtNotification,
    fileSystem,
  });
  const { t } = useI18n();

  const contextValue = useMemo(() => ({
    getClient: provider.getClient,
    agents: provider.agents,
    workspaces: provider.workspaces,
    addAgent: provider.addAgent,
    removeAgent: provider.removeAgent,
    addWorkspace: provider.addWorkspace,
    removeWorkspace: provider.removeWorkspace,
    isReady: provider.isReady,
    onOpenFile,
    onFileContentRead: fileSystem?.onFileContentRead,
  }), [provider, onOpenFile, fileSystem?.onFileContentRead]);

  // Sync defaultCwd to store once on mount
  React.useEffect(() => {
    if (defaultCwd) {
      acpStore.getState().addWorkspace(defaultCwd);
    }
  }, [defaultCwd]);

  if (!provider.isReady) {
    return (
      <div data-acp-theme={theme} className={styles.acpLoading}>
        <div className={styles.acpLoadingSpinner} />
        <span>{t('loading.connecting')}</span>
      </div>
    );
  }

  const content = (
    <AcpContext.Provider value={contextValue}>
      <div data-acp-theme={theme}>
        {children}
      </div>
    </AcpContext.Provider>
  );

  // Only wrap with FileSystemProvider when onDirectoryRead is provided (file tree capability)
  return fileSystem?.onDirectoryRead ? (
    <FileSystemProviderWrapper options={fileSystem}>
      {content}
    </FileSystemProviderWrapper>
  ) : content;
}
