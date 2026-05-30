import { useCallback, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand/react';
import { sessionStore } from '@acp-components/core';
import { useSessions } from '../../hooks/useSessions';
import { useAcpStore } from '../../hooks/useAcpStore';
import { useI18n } from '../../i18n';
import type { SessionMeta } from '@acp-components/core';
import type { SessionId } from '@agentclientprotocol/sdk';
import styles from './session-list.module.scss';

type SessionStatusType = 'running' | 'needs-action' | null;

function useSessionStatus(sessionId: SessionId): SessionStatusType {
  const ref = useRef<SessionStatusType>(null);
  const status = useStore(sessionStore, (s) => {
    const data = s.sessions.get(sessionId);
    if (!data) return null;
    let next: SessionStatusType = null;
    if (data.pendingPermissions.length > 0) next = 'needs-action';
    else if (data.isStreaming) next = 'running';
    if (next === ref.current) return ref.current;
    ref.current = next;
    return next;
  });
  return status;
}

function SessionItem({ session, isActive, onSelect, onClose, formatTime }: {
  session: SessionMeta;
  isActive: boolean;
  onSelect: (id: SessionId) => void;
  onClose: (id: SessionId) => void;
  formatTime: (dateStr?: string) => string;
}) {
  const { t } = useI18n();
  const status = useSessionStatus(session.id);

  return (
    <div
      className={`${styles.acpSessionItem}${isActive ? ` ${styles.acpSessionItemActive}` : ''}`}
      onClick={() => { if (!isActive) onSelect(session.id); }}
      role="option"
      aria-selected={isActive}
    >
      <span className={`${styles.acpSessionItemIcon}${status ? ` ${styles[`acpSessionItemIcon${status === 'running' ? 'Running' : 'NeedsAction'}`]}` : ''}`} title={status ? (status === 'running' ? t('sessionList.statusRunning') : t('sessionList.statusNeedsAction')) : undefined}>
        {status === 'running' ? <span className={styles.acpSessionItemSpinner} /> : status === 'needs-action' ? '!' : '\u{1F4AC}'}
      </span>
      <div className={styles.acpSessionItemContent}>
        <div className={styles.acpSessionItemTitle}>
          {session.title || t('sessionList.defaultSessionTitle')}
        </div>
        <div className={styles.acpSessionItemMeta}>{formatTime(session.updatedAt)}</div>
      </div>
      <button
        className={styles.acpSessionItemDelete}
        onClick={(e) => { e.stopPropagation(); onClose(session.id); }}
        aria-label={t('sessionList.closeSession')}
        title={t('sessionList.closeSession')}
      >
        &#x2715;
      </button>
    </div>
  );
}

const agentDotClass: Record<string, string> = {
  connected: styles.acpSessionAgentHeaderDotConnected,
  connecting: styles.acpSessionAgentHeaderDotConnecting,
  disconnected: styles.acpSessionAgentHeaderDotDisconnected,
  error: styles.acpSessionAgentHeaderDotError,
};

export function SessionList() {
  const { activeSessionId, setActiveSession, selectSession, createSession, closeSession, sessionListCursors, loadMoreSessions } = useSessions();
  const agents = useAcpStore((s) => s.agents);
  const workspaces = useAcpStore((s) => s.workspaces);
  const activeWorkspaceCwd = useAcpStore((s) => s.activeWorkspaceCwd);
  const { t } = useI18n();

  const sessions = useMemo(() => {
    if (!activeWorkspaceCwd) return [];
    return Array.from(workspaces.get(activeWorkspaceCwd)?.sessions.values() ?? []);
  }, [workspaces, activeWorkspaceCwd]);

  const agentSessions = useMemo(() => {
    const map = new Map<string, typeof sessions>();
    for (const s of sessions) {
      const list = map.get(s.agentId);
      if (list) {
        list.push(s);
      } else {
        map.set(s.agentId, [s]);
      }
    }
    return map;
  }, [sessions]);

  const agentList = Array.from(agents.values());

  const hasMore = useMemo(() => {
    return agentList.some((a) => sessionListCursors.includes(a.id));
  }, [agentList, sessionListCursors]);

  const [loadingMore, setLoadingMore] = useState(false);

  const handleLoadMore = useCallback(async () => {
    if (!activeWorkspaceCwd || loadingMore) return;
    setLoadingMore(true);
    try {
      for (const agent of agentList) {
        if (sessionListCursors.includes(agent.id)) {
          await loadMoreSessions(agent.id, activeWorkspaceCwd);
        }
      }
    } finally {
      setLoadingMore(false);
    }
  }, [activeWorkspaceCwd, loadingMore, agentList, sessionListCursors, loadMoreSessions]);

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
          <div className={styles.acpSessionListEmptyState}>
            {t('sessionList.emptyState')}
          </div>
        )}
        {agentList.map((agent) => {
          const agentSess = agentSessions.get(agent.id) ?? [];
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
                    if (!activeWorkspaceCwd) return;
                    try {
                      const id = await createSession(agent.id, activeWorkspaceCwd);
                      setActiveSession(id);
                    } catch (e) {
                      console.error('Failed to create session:', e);
                    }
                  }}
                  aria-label={t('sessionList.newSession')}
                  title={t('sessionList.newSession')}
                >
                  +
                </button>
              </div>
              {agentSess.map((s) => (
                <SessionItem
                  key={s.id}
                  session={s}
                  isActive={activeSessionId === s.id}
                  onSelect={selectSession}
                  onClose={closeSession}
                  formatTime={formatTime}
                />
              ))}
            </div>
          );
        })}
        {hasMore && (
          <div className={styles.acpSessionLoadMore}>
            <button
              className={styles.acpSessionLoadMoreBtn}
              onClick={handleLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? '...' : t('sessionList.loadMore')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
