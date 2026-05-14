import React from 'react';
import { useSessions } from '../../hooks/useSessions';
import { useConnectionStatus } from '../../hooks/useConnectionStatus';
import { useAcpStore } from '../../hooks/useAcpStore';
import type { SessionId } from '@agentclientprotocol/sdk';
import { useI18n } from '../../i18n';
import styles from './session-list.module.scss';

export function SessionList() {
  const { sessions, activeSessionId, setActiveSession, selectSession, createSession, closeSession } = useSessions();
  const { agentName } = useConnectionStatus();
  const projectCwd = useAcpStore((s) => s.projectCwd);
  const { t } = useI18n();

  const handleNewSession = async () => {
    const id = await createSession(projectCwd);
    setActiveSession(id);
  };

  return (
    <div className={styles.acpSessionList}>
      <div className={styles.acpSessionListHeader}>
        <span className={styles.acpSessionListTitle}>{t('sessionList.title')}</span>
        <button
          className={styles.acpSessionListNewBtn}
          onClick={handleNewSession}
          aria-label={t('sessionList.newSession')}
          title={t('sessionList.newSession')}
        >
          +
        </button>
      </div>
      <div className={styles.acpSessionListItems} role="listbox" aria-label={t('sessionList.title')}>
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
              <div className={styles.acpSessionItemTitle}>{s.title || t('sessionList.defaultSessionTitle')}</div>
              <div className={styles.acpSessionItemMeta}>{s.cwd}</div>
            </div>
            <button
              className={styles.acpSessionItemDelete}
              onClick={(e) => { e.stopPropagation(); closeSession(s.id); }}
              aria-label={t('sessionList.closeSession')}
              title={t('sessionList.closeSession')}
            >
              &#x2715;
            </button>
          </div>
        ))}
        {sessions.length === 0 && (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--acp-color-text-muted)', fontSize: '13px' }}>
            {t('sessionList.emptyState')}
          </div>
        )}
      </div>
      <div className={styles.acpAgentInfo}>
        <span className={styles.acpAgentInfoName}>{agentName}</span>
      </div>
    </div>
  );
}
