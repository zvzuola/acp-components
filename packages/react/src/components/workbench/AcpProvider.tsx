import React, { useMemo } from 'react';
import { AcpContext, useAcpProvider } from '@acp-components/core';
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
}

export function AcpProvider({ transport, clientInfo, clientCapabilities, theme = 'dark', children, onFileRead, onFileWrite }: AcpProviderProps) {
  const { client, ready } = useAcpProvider({ transport, clientInfo, clientCapabilities, onFileRead, onFileWrite });

  const contextValue = useMemo(() => ({
    client,
    config: transport,
    clientInfo,
  }), [client, transport, clientInfo]);

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
