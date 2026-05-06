import React, { useMemo } from 'react';
import { AcpContext, useAcpProvider } from '@acp-components/core';
import type { TransportConfig, Implementation } from '@acp-components/core';
import styles from './loading.module.scss';

export interface AcpProviderProps {
  transport: TransportConfig;
  clientInfo?: Implementation;
  theme?: 'light' | 'dark';
  children: React.ReactNode;
}

export function AcpProvider({ transport, clientInfo, theme = 'dark', children }: AcpProviderProps) {
  const { client, ready } = useAcpProvider({ transport, clientInfo });

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
