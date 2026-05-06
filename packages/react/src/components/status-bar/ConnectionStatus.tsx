import React from 'react';
import { useConnectionStatus } from '@acp-components/core';
import styles from './connection-status.module.scss';

const dotClass: Record<string, string> = {
  connected: styles.acpConnectionStatusDotConnected,
  connecting: styles.acpConnectionStatusDotConnecting,
  disconnected: styles.acpConnectionStatusDotDisconnected,
  error: styles.acpConnectionStatusDotError,
};

export function ConnectionStatus() {
  const { status, isConnected, agentName } = useConnectionStatus();

  return (
    <div className={styles.acpConnectionStatus} role="status" aria-label={`Agent status: ${status}`}>
      <span className={`${styles.acpConnectionStatusDot} ${dotClass[status] || ''}`} />
      <span>
        {isConnected ? agentName : status}
      </span>
    </div>
  );
}
