import React, { useMemo } from 'react';
import { AcpContext } from '../../context/AcpContext';
import { useAcpProvider } from '../../hooks/useAcpProvider';
import { acpStore } from '@acp-components/core';
import type { AgentConfig, TerminalHandler } from '@acp-components/core';
import type { FileReadHandler, FileWriteHandler } from '@acp-components/core';
import { useI18n } from '../../i18n';
import styles from './loading.module.scss';

export interface AcpProviderProps {
  agents: AgentConfig[];
  theme?: 'light' | 'dark';
  children: React.ReactNode;
  onFileRead?: FileReadHandler;
  onFileWrite?: FileWriteHandler;
  onTerminal?: TerminalHandler;
  defaultCwd?: string;
}

export function AcpProvider({ agents, theme = 'dark', children, onFileRead, onFileWrite, onTerminal, defaultCwd = '' }: AcpProviderProps) {
  const provider = useAcpProvider({ agents, onFileRead, onFileWrite, onTerminal });
  const { t } = useI18n();

  const contextValue = useMemo(() => ({
    getClient: provider.getClient,
    agents: provider.agents,
    activeWorkspaceCwd: provider.activeWorkspaceCwd,
    workspaces: provider.workspaces,
    addAgent: provider.addAgent,
    removeAgent: provider.removeAgent,
    setActiveWorkspace: provider.setActiveWorkspace,
    addWorkspace: provider.addWorkspace,
    removeWorkspace: provider.removeWorkspace,
    isReady: provider.isReady,
  }), [provider]);

  // Sync defaultCwd to store once on mount
  React.useEffect(() => {
    if (defaultCwd) {
      acpStore.getState().setActiveWorkspace(defaultCwd);
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

  return (
    <AcpContext.Provider value={contextValue}>
      <div data-acp-theme={theme}>
        {children}
      </div>
    </AcpContext.Provider>
  );
}
