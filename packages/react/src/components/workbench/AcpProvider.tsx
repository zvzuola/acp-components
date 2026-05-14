import React, { useMemo } from 'react';
import { AcpContext } from '../../context/AcpContext';
import { useAcpProvider } from '../../hooks/useAcpProvider';
import { useAcpStore } from '../../hooks/useAcpStore';
import { acpStore } from '@acp-components/core';
import type { TransportConfig, Implementation, FileReadHandler, FileWriteHandler } from '@acp-components/core';
import type { ClientCapabilities } from '@agentclientprotocol/sdk';
import { useI18n } from '../../i18n';
import styles from './loading.module.scss';

export interface AcpProviderProps {
  transport: TransportConfig;
  clientInfo?: Implementation;
  clientCapabilities?: ClientCapabilities;
  theme?: 'light' | 'dark';
  children: React.ReactNode;
  onFileRead?: FileReadHandler;
  onFileWrite?: FileWriteHandler;
  defaultCwd?: string;
}

export function AcpProvider({ transport, clientInfo, clientCapabilities, theme = 'dark', children, onFileRead, onFileWrite, defaultCwd = '' }: AcpProviderProps) {
  const { client, ready } = useAcpProvider({ transport, clientInfo, clientCapabilities, onFileRead, onFileWrite });
  const projectCwd = useAcpStore((s) => s.projectCwd);
  const { t } = useI18n();

  const contextValue = useMemo(() => ({
    client,
    config: transport,
    clientInfo,
    projectCwd,
  }), [client, transport, clientInfo, projectCwd]);

  // Sync defaultCwd to store once on mount
  React.useEffect(() => {
    if (defaultCwd) {
      acpStore.getState().setProjectCwd(defaultCwd);
    }
  }, [defaultCwd]);

  if (!ready) {
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
