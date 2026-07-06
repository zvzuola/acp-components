import { useCallback, useMemo, useRef, useState } from 'react';
import { CloseOutlined, DeleteOutlined, ForkOutlined, MessageOutlined, FolderOutlined, MoreOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import { useStore } from 'zustand/react';
import { sessionStore } from '@acp-components/core';
import { useSessions } from '../../hooks/useSessions';
import { useAcpStore } from '../../hooks/useAcpStore';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { usePlatform } from '../../context/PlatformContext';
import { useI18n } from '../../i18n';
import { Dropdown } from '../dropdown';
import type { SessionMeta, WorkspaceState } from '@acp-components/core';
import type { SessionId } from '@acp-components/core';
import styles from './session-list.module.scss';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SessionStatusType = 'running' | 'needs-action' | null;

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

function SessionItem({ session, isActive, onSelect }: {
  session: SessionMeta;
  isActive: boolean;
  onSelect?: (session: SessionMeta) => void;
}) {
  const { t } = useI18n();
  const formatTime = useFormatTime();
  const { selectSession, deleteSession, forkSession, setActiveSession } = useSessions();
  const status = useSessionStatus(session.id);
  const supportsFork = useAcpStore((s) => !!s.agents.get(session.agentId)?.capabilities?.sessionCapabilities?.fork);
  const supportsDelete = useAcpStore((s) => !!s.agents.get(session.agentId)?.capabilities?.sessionCapabilities?.delete);
  const [isForking, setIsForking] = useState(false);

  return (
    <div
      className={`${styles.acpSessionItem}${isActive ? ` ${styles.acpSessionItemActive}` : ''}`}
      onClick={() => {
        // Clicking a session always signals "show me this conversation" —
        // including when it's already the active one (the host may be on a
        // non-session view). The select call is idempotent for an already
        // active, loaded session.
        if (!isActive) void selectSession(session.id);
        onSelect?.(session);
      }}
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
      {supportsFork && (
        <button
          className={styles.acpSessionItemFork}
          onClick={async (e) => {
            e.stopPropagation();
            if (isForking) return;
            setIsForking(true);
            try {
              const newId = await forkSession(session.id);
              setActiveSession(newId);
            } catch (err) {
              console.error('Failed to fork session:', err);
            } finally {
              setIsForking(false);
            }
          }}
          disabled={isForking}
          aria-label={t('sessionList.forkSession')}
          title={t('sessionList.forkSession')}
        >
          <ForkOutlined />
        </button>
      )}
      {supportsDelete && (
        <button
          className={styles.acpSessionItemDelete}
          onClick={(e) => { e.stopPropagation(); void deleteSession(session.id); }}
          aria-label={t('sessionList.deleteSession')}
          title={t('sessionList.deleteSession')}
        >
          <CloseOutlined />
        </button>
      )}
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

function AgentGroup({ agentId, agentName, agentStatus, sessions, cwd, onSelectSession }: {
  agentId: string;
  agentName: string;
  agentStatus: string;
  sessions: SessionMeta[];
  cwd: string;
  onSelectSession?: (session: SessionMeta) => void;
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
              onSelect={onSelectSession}
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

function WorkspaceGroup({ cwd, workspace, isWorkspaceActive, onSelectSession }: {
  cwd: string;
  workspace: WorkspaceState;
  isWorkspaceActive: boolean;
  onSelectSession?: (session: SessionMeta) => void;
}) {
  const { t } = useI18n();
  const { removeWorkspace } = useWorkspaces();
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

  const handleRemove = useCallback(() => {
    // Matches the SessionItem delete pattern: remove directly. A native
    // confirm dialog is not part of the Platform Dialogs slice today; if the
    // host grows one, wire it here before calling removeWorkspace(cwd).
    removeWorkspace(cwd);
  }, [removeWorkspace, cwd]);

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
        <div className={styles.acpSessionWorkspaceHeaderActions}>
          {sessionCount > 0 && (
            <span className={styles.acpSessionWorkspaceHeaderBadge}>{sessionCount}</span>
          )}
          {/* The wrapper stops click propagation so opening the menu does not
              also toggle the workspace collapse (the trigger's onClick is
              swapped in by Dropdown.Trigger via cloneElement, so the stop must
              live on an ancestor). */}
          <span className={styles.acpSessionWorkspaceHeaderMoreWrap} onClick={(e) => e.stopPropagation()}>
            <Dropdown placement="bottom-end">
              <Dropdown.Trigger asChild>
                <button
                  className={styles.acpSessionWorkspaceHeaderMore}
                  aria-label={t('sessionList.workspaceActions')}
                  title={t('sessionList.workspaceActions')}
                >
                  <MoreOutlined />
                </button>
              </Dropdown.Trigger>
              <Dropdown.Content width={180}>
                <Dropdown.Item
                  icon={<DeleteOutlined />}
                  label={t('sessionList.removeWorkspace')}
                  onClick={handleRemove}
                />
              </Dropdown.Content>
            </Dropdown>
          </span>
        </div>
      </div>
      {!collapsed && (
        <div className={styles.acpSessionWorkspaceBody}>
          {agentList.map((agent) => (
            <AgentGroup
              key={agent.id}
              agentId={agent.id}
              agentName={agent.agentInfo?.title || agent.name}
              agentStatus={agent.status}
              sessions={agentSessions.get(agent.id) ?? []}
              cwd={cwd}
              onSelectSession={onSelectSession}
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

export function SessionList({ onSelectSession }: { onSelectSession?: (session: SessionMeta) => void } = {}) {
  const agents = useAcpStore((s) => s.agents);
  const { workspaces, addWorkspace, activeWorkspaceCwd } = useWorkspaces();
  const { t } = useI18n();
  const { dialogs } = usePlatform();
  const openFilePicker = dialogs?.openFilePicker;

  const agentList = Array.from(agents.values());
  const workspaceList = workspaces.map((ws) => [ws.cwd, ws] as const);

  const handleAddClick = useCallback(() => {
    // Pick a directory (default) — the picker may be absent on a minimal host.
    if (!openFilePicker) return;
    openFilePicker({ directory: true })
      .then((dir) => {
        if (dir) addWorkspace(dir);
      })
      .catch(console.error);
  }, [openFilePicker, addWorkspace]);

  return (
    <div className={styles.acpSessionList}>
      <div className={styles.acpSessionListHeader}>
        <span className={styles.acpSessionListTitle}>{t('sessionList.title')}</span>
        <button
          className={styles.acpSessionListNewBtn}
          onClick={handleAddClick}
          aria-label={t('sessionList.addWorkspace')}
          title={t('sessionList.addWorkspace')}
        >
          <PlusOutlined />
        </button>
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
            onSelectSession={onSelectSession}
          />
        ))}
      </div>
    </div>
  );
}
