import React, { useMemo } from 'react';
import { AcpContext, useAcpProvider, useAcpStore } from '@acp-components/core';
import type { TransportConfig, Implementation, FileReadHandler, FileWriteHandler } from '@acp-components/core';
import type { ClientCapabilities } from '@agentclientprotocol/sdk';
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

  const contextValue = useMemo(() => ({
    client,
    config: transport,
    clientInfo,
    projectCwd,
  }), [client, transport, clientInfo, projectCwd]);

  // Sync defaultCwd to store once on mount
  React.useEffect(() => {
    if (defaultCwd) {
      useAcpStore.getState().setProjectCwd(defaultCwd);
    }
  }, [defaultCwd]);

  if (!ready) {
    return (
      <div data-acp-theme={theme} className={styles.acpLoading}>
        <div className={styles.acpLoadingSpinner} />
        <span>Connecting to agent...</span>
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
