import { useCallback, useMemo, useRef, useState } from 'react';
import { CloseOutlined, MessageOutlined, FolderOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import { useStore } from 'zustand/react';
import { sessionStore } from '@acp-components/core';
import { useSessions } from '../../hooks/useSessions';
import { useAcpStore } from '../../hooks/useAcpStore';
import { useI18n } from '../../i18n';
import type { SessionMeta, WorkspaceState } from '@acp-components/core';
import type { SessionId } from '@agentclientprotocol/sdk';
import styles from './session-list.module.scss';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SessionStatusType = 'running' | 'needs-action' | null;

export interface SessionListProps {
  onBrowse?: () => Promise<string | null>;
}

function getWorkspaceName(cwd: string): string {
  const normalized = cwd.replace(/[/\\]+$/, '');
  const parts = normalized.split(/[/\\]/);
  return parts[parts.length - 1] || cwd;
}

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

function useFormatTime() {
  const { t } = useI18n();
  return useCallback((dateStr?: string): string => {
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
}

// ---------------------------------------------------------------------------
// SessionItem — renders a single session row
// ---------------------------------------------------------------------------

function SessionItem({ session, isActive }: {
  session: SessionMeta;
  isActive: boolean;
}) {
  const { t } = useI18n();
  const formatTime = useFormatTime();
  const { selectSession, closeSession } = useSessions();
  const status = useSessionStatus(session.id);

  return (
    <div
      className={`${styles.acpSessionItem}${isActive ? ` ${styles.acpSessionItemActive}` : ''}`}
      onClick={() => { if (!isActive) void selectSession(session.id); }}
      role="option"
      aria-selected={isActive}
    >
      <span className={`${styles.acpSessionItemIcon}${status ? ` ${styles[`acpSessionItemIcon${status === 'running' ? 'Running' : 'NeedsAction'}`]}` : ''}`} title={status ? (status === 'running' ? t('sessionList.statusRunning') : t('sessionList.statusNeedsAction')) : undefined}>
        {status === 'running' ? <span className={styles.acpSessionItemSpinner} /> : status === 'needs-action' ? '!' : <MessageOutlined />}
      </span>
      <div className={styles.acpSessionItemContent}>
        <div className={styles.acpSessionItemTitle}>
          {session.title || t('sessionList.defaultSessionTitle')}
        </div>
        <div className={styles.acpSessionItemMeta}>{formatTime(session.updatedAt)}</div>
      </div>
      <button
        className={styles.acpSessionItemDelete}
        onClick={(e) => { e.stopPropagation(); void closeSession(session.id); }}
        aria-label={t('sessionList.closeSession')}
        title={t('sessionList.closeSession')}
      >
        <CloseOutlined />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AgentGroup — renders one agent's sessions inside a workspace.
// Owns its own "load more" state and cursor check.
// ---------------------------------------------------------------------------

const agentDotClass: Record<string, string> = {
  connected: styles.acpSessionAgentHeaderDotConnected,
  connecting: styles.acpSessionAgentHeaderDotConnecting,
  disconnected: styles.acpSessionAgentHeaderDotDisconnected,
  error: styles.acpSessionAgentHeaderDotError,
};

function AgentGroup({ agentId, agentName, agentStatus, sessions, cwd }: {
  agentId: string;
  agentName: string;
  agentStatus: string;
  sessions: SessionMeta[];
  cwd: string;
}) {
  const { t } = useI18n();
  const { activeSessionId, loadMoreSessions, createSession, setActiveSession } = useSessions();
  const [collapsed, setCollapsed] = useState(false);
  const toggleCollapsed = useCallback(() => setCollapsed((v) => !v), []);

  // --- "Load more" — owned entirely by this component ---
  const hasMore = useAcpStore((s) => {
    const cursors = s.workspaces.get(cwd)?.sessionListCursors;
    return cursors?.has(agentId) ?? false;
  });
  const [loadingMore, setLoadingMore] = useState(false);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      await loadMoreSessions(agentId, cwd);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, loadMoreSessions, agentId, cwd]);

  return (
    <div className={styles.acpSessionAgentGroup}>
      <div className={styles.acpSessionAgentHeader}>
        <span
          className={styles.acpSessionAgentHeaderName}
          onClick={toggleCollapsed}
          role="button"
          tabIndex={0}
        >
          <span className={`${styles.acpSessionGroupChevron}${collapsed ? '' : ` ${styles.acpSessionGroupChevronExpanded}`}`}><RightOutlined /></span>
          <span className={`${styles.acpSessionAgentHeaderDot} ${agentDotClass[agentStatus] || ''}`} />
          {agentName}
        </span>
        <button
          className={styles.acpSessionAgentHeaderAdd}
          onClick={async () => {
            try {
              const id = await createSession(agentId, cwd);
              setActiveSession(id);
            } catch (e) {
              console.error('Failed to create session:', e);
            }
          }}
          aria-label={t('sessionList.newSession')}
          title={t('sessionList.newSession')}
        >
          <PlusOutlined />
        </button>
      </div>
      {!collapsed && (
        <>
          {sessions.map((s) => (
            <SessionItem
              key={s.id}
              session={s}
              isActive={activeSessionId === s.id}
            />
          ))}
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
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WorkspaceGroup — renders a workspace and its agent groups
// ---------------------------------------------------------------------------

function WorkspaceGroup({ cwd, workspace, isWorkspaceActive }: {
  cwd: string;
  workspace: WorkspaceState;
  isWorkspaceActive: boolean;
}) {
  const { t } = useI18n();
  const agents = useAcpStore((s) => s.agents);
  const [collapsed, setCollapsed] = useState(false);
  const toggleCollapsed = useCallback(() => setCollapsed((v) => !v), []);

  const sessions = Array.from(workspace.sessions.values());
  const sessionCount = sessions.length;

  // Group sessions by agentId
  const agentSessions = useMemo(() => {
    const map = new Map<string, SessionMeta[]>();
    for (const s of sessions) {
      const list = map.get(s.agentId);
      if (list) list.push(s);
      else map.set(s.agentId, [s]);
    }
    return map;
  }, [sessions]);

  const agentList = Array.from(agents.values());

  return (
    <div className={`${styles.acpSessionWorkspaceGroup}${isWorkspaceActive ? ` ${styles.acpSessionWorkspaceGroupActive}` : ''}`}>
      <div
        className={styles.acpSessionWorkspaceHeader}
        onClick={toggleCollapsed}
        role="button"
        tabIndex={0}
        title={cwd}
      >
        <span className={styles.acpSessionWorkspaceHeaderLeft}>
          <span className={`${styles.acpSessionGroupChevron}${collapsed ? '' : ` ${styles.acpSessionGroupChevronExpanded}`}`}><RightOutlined /></span>
          <span className={styles.acpSessionWorkspaceHeaderFolder}><FolderOutlined /></span>
          <span className={styles.acpSessionWorkspaceHeaderName}>{getWorkspaceName(cwd)}</span>
        </span>
        {sessionCount > 0 && (
          <span className={styles.acpSessionWorkspaceHeaderBadge}>{sessionCount}</span>
        )}
      </div>
      {!collapsed && (
        <div className={styles.acpSessionWorkspaceBody}>
          {agentList.map((agent) => (
            <AgentGroup
              key={agent.id}
              agentId={agent.id}
              agentName={agent.name}
              agentStatus={agent.status}
              sessions={agentSessions.get(agent.id) ?? []}
              cwd={cwd}
            />
          ))}
          {sessionCount === 0 && (
            <div className={styles.acpSessionWorkspaceEmpty}>
              {t('sessionList.workspaceEmpty')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SessionList — top-level orchestrator
// ---------------------------------------------------------------------------

export function SessionList({ onBrowse }: SessionListProps) {
  const { activeSessionId } = useSessions();
  const agents = useAcpStore((s) => s.agents);
  const workspaces = useAcpStore((s) => s.workspaces);
  const addWorkspace = useAcpStore((s) => s.addWorkspace);
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const agentList = Array.from(agents.values());
  const workspaceList = Array.from(workspaces.entries());

  // Derive the workspace containing the active session
  const activeWorkspaceCwd = useMemo(() => {
    if (!activeSessionId) return null;
    for (const [cwd, ws] of workspaces) {
      if (ws.sessions.has(activeSessionId)) return cwd;
    }
    return null;
  }, [activeSessionId, workspaces]);

  const handleAddClick = useCallback(() => {
    if (onBrowse) {
      onBrowse().then((dir) => {
        if (dir) addWorkspace(dir);
      }).catch(console.error);
    } else {
      setAdding(true);
      setInputValue('');
    }
  }, [onBrowse, addWorkspace]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const trimmed = inputValue.trim();
      if (trimmed) addWorkspace(trimmed);
      setAdding(false);
      setInputValue('');
    } else if (e.key === 'Escape') {
      setAdding(false);
      setInputValue('');
    }
  }, [inputValue, addWorkspace]);

  const handleInputBlur = useCallback(() => {
    const trimmed = inputValue.trim();
    if (trimmed) addWorkspace(trimmed);
    setAdding(false);
    setInputValue('');
  }, [inputValue, addWorkspace]);

  return (
    <div className={styles.acpSessionList}>
      <div className={styles.acpSessionListHeader}>
        <span className={styles.acpSessionListTitle}>{t('sessionList.title')}</span>
        {adding ? (
          <input
            ref={inputRef}
            className={styles.acpSessionListInput}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            onBlur={handleInputBlur}
            placeholder={t('sessionList.addWorkspacePlaceholder')}
            autoFocus
            aria-label={t('sessionList.addWorkspaceAriaLabel')}
          />
        ) : (
          <button
            className={styles.acpSessionListNewBtn}
            onClick={handleAddClick}
            aria-label={t('sessionList.addWorkspace')}
            title={t('sessionList.addWorkspace')}
          >
            <PlusOutlined />
          </button>
        )}
      </div>
      <div className={styles.acpSessionListItems} role="listbox" aria-label={t('sessionList.title')}>
        {agentList.length === 0 && (
          <div className={styles.acpSessionListEmptyState}>
            {t('sessionList.emptyState')}
          </div>
        )}
        {workspaceList.map(([cwd, ws]) => (
          <WorkspaceGroup
            key={cwd}
            cwd={cwd}
            workspace={ws}
            isWorkspaceActive={cwd === activeWorkspaceCwd}
          />
        ))}
      </div>
    </div>
  );
}
