import React from 'react';
import { useAllAgentStatuses } from '../../hooks/useConnectionStatus';
import styles from './connection-status.module.scss';

const dotClass: Record<string, string> = {
  connected: styles.acpConnectionStatusDotConnected,
  connecting: styles.acpConnectionStatusDotConnecting,
  disconnected: styles.acpConnectionStatusDotDisconnected,
  error: styles.acpConnectionStatusDotError,
};

export function ConnectionStatus() {
  const { agents, overallStatus } = useAllAgentStatuses();

  if (agents.length === 0) {
    return (
      <div className={styles.acpConnectionStatus} role="status" aria-label="No agent connected">
        <span className={`${styles.acpConnectionStatusDot} ${dotClass.disconnected}`} />
        <span>disconnected</span>
      </div>
    );
  }

  return (
    <div className={styles.acpConnectionStatus} role="status" aria-label={`Agent status: ${overallStatus}`}>
      {agents.map((agent) => (
        <span
          key={agent.id}
          className={styles.acpConnectionStatusItem}
          title={`${agent.name}: ${agent.status}`}
        >
          <span className={`${styles.acpConnectionStatusDot} ${dotClass[agent.status] || ''}`} />
          <span>{agent.name}</span>
        </span>
      ))}
    </div>
  );
}
