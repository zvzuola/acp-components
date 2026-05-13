import React from 'react';
import { useSessions } from '../../hooks/useSessions';
import { useConnectionStatus } from '../../hooks/useConnectionStatus';
import { useAcpStore } from '../../hooks/useAcpStore';
import type { SessionId } from '@agentclientprotocol/sdk';
import styles from './session-list.module.scss';

export function SessionList() {
  const { sessions, activeSessionId, setActiveSession, selectSession, createSession, closeSession } = useSessions();
  const { agentName } = useConnectionStatus();
  const projectCwd = useAcpStore((s) => s.projectCwd);

  const handleNewSession = async () => {
    const id = await createSession(projectCwd);
    setActiveSession(id);
  };

  return (
    <div className={styles.acpSessionList}>
      <div className={styles.acpSessionListHeader}>
        <span className={styles.acpSessionListTitle}>Sessions</span>
        <button
          className={styles.acpSessionListNewBtn}
          onClick={handleNewSession}
          aria-label="New session"
          title="New session"
        >
          +
        </button>
      </div>
      <div className={styles.acpSessionListItems} role="listbox" aria-label="Sessions">
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`${styles.acpSessionItem}${activeSessionId === s.id ? ` ${styles.acpSessionItemActive}` : ''}`}
            onClick={() => selectSession(s.id)}
            role="option"
            aria-selected={activeSessionId === s.id}
          >
            <span className={styles.acpSessionItemIcon}>&#x1f4ac;</span>
            <div className={styles.acpSessionItemContent}>
              <div className={styles.acpSessionItemTitle}>{s.title || 'New Session'}</div>
              <div className={styles.acpSessionItemMeta}>{s.cwd}</div>
            </div>
            <button
              className={styles.acpSessionItemDelete}
              onClick={(e) => { e.stopPropagation(); closeSession(s.id); }}
              aria-label="Close session"
              title="Close session"
            >
              &#x2715;
            </button>
          </div>
        ))}
        {sessions.length === 0 && (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--acp-color-text-muted)', fontSize: '13px' }}>
            No sessions yet. Click + to start.
          </div>
        )}
      </div>
      <div className={styles.acpAgentInfo}>
        <span className={styles.acpAgentInfoName}>{agentName}</span>
      </div>
    </div>
  );
}
