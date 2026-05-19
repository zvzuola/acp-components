import { useCallback, useMemo } from 'react';
import { useSessions } from '../../hooks/useSessions';
import { useAcpStore } from '../../hooks/useAcpStore';
import { useI18n } from '../../i18n';
import styles from './session-list.module.scss';

const agentDotClass: Record<string, string> = {
  connected: styles.acpSessionAgentHeaderDotConnected,
  connecting: styles.acpSessionAgentHeaderDotConnecting,
  disconnected: styles.acpSessionAgentHeaderDotDisconnected,
  error: styles.acpSessionAgentHeaderDotError,
};

export function SessionList() {
  const { sessions: allSessions, activeSessionId, setActiveSession, selectSession, createSession, closeSession } = useSessions();
  const agents = useAcpStore((s) => s.agents);
  const projectCwd = useAcpStore((s) => s.projectCwd);
  const { t } = useI18n();

  const agentSessions = useMemo(() => {
    const map = new Map<string, typeof allSessions>();
    for (const s of allSessions) {
      const list = map.get(s.agentId);
      if (list) {
        list.push(s);
      } else {
        map.set(s.agentId, [s]);
      }
    }
    return map;
  }, [allSessions]);

  const agentList = Array.from(agents.values());

  const formatTime = useCallback((dateStr?: string): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return t('time.justNow');
    if (minutes < 60) return t('time.minutesAgo', { minutes });
    if (hours < 24) return t('time.hoursAgo', { hours });
    if (days < 7) return t('time.daysAgo', { days });
    return date.toLocaleDateString();
  }, [t]);

  return (
    <div className={styles.acpSessionList}>
      <div className={styles.acpSessionListHeader}>
        <span className={styles.acpSessionListTitle}>{t('sessionList.title')}</span>
      </div>
      <div className={styles.acpSessionListItems} role="listbox" aria-label={t('sessionList.title')}>
        {agentList.length === 0 && (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--acp-color-text-muted)', fontSize: '13px' }}>
            {t('sessionList.emptyState')}
          </div>
        )}
        {agentList.map((agent) => {
          const sessions = agentSessions.get(agent.id) ?? [];
          return (
            <div key={agent.id} className={styles.acpSessionAgentGroup}>
              <div className={styles.acpSessionAgentHeader}>
                <span className={styles.acpSessionAgentHeaderName}>
                  <span className={`${styles.acpSessionAgentHeaderDot} ${agentDotClass[agent.status] || ''}`} />
                  {agent.name}
                </span>
                <button
                  className={styles.acpSessionAgentHeaderAdd}
                  onClick={async () => {
                    const id = await createSession(agent.id, projectCwd);
                    setActiveSession(id);
                  }}
                  aria-label={t('sessionList.newSession')}
                  title={t('sessionList.newSession')}
                >
                  +
                </button>
              </div>
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={`${styles.acpSessionItem}${activeSessionId === s.id ? ` ${styles.acpSessionItemActive}` : ''}`}
                  onClick={() => { if (activeSessionId !== s.id) selectSession(s.id); }}
                  role="option"
                  aria-selected={activeSessionId === s.id}
                >
                  <span className={styles.acpSessionItemIcon}>&#x1f4ac;</span>
                  <div className={styles.acpSessionItemContent}>
                    <div className={styles.acpSessionItemTitle}>{s.title || t('sessionList.defaultSessionTitle')}</div>
                    <div className={styles.acpSessionItemMeta}>{formatTime(s.updatedAt)}</div>
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
