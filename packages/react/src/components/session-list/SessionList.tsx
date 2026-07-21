import { useCallback, useMemo, useRef, useState } from 'react';
import { CloseOutlined, DeleteOutlined, ForkOutlined, MessageOutlined, FolderOutlined, FolderOpenOutlined, MoreOutlined, PlusOutlined } from '@ant-design/icons';
import { useStore } from 'zustand/react';
import { sessionStore, acpStore } from '@acp-components/core';
import { useSessions } from '../../hooks/useSessions';
import { useAcpStore } from '../../hooks/useAcpStore';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { usePlatform } from '../../context/PlatformContext';
import { useI18n } from '../../i18n';
import { Dropdown } from '../dropdown';
import type { SessionMeta, WorkspaceState } from '@acp-components/core';
import type { SessionId } from '@acp-components/core';
import { getAgentName } from '../../utils/agentName';
import { SESSION_DRAG_MIME } from '../../constants';
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

// Status dot class per agent connection status — shared by SessionItem (and
// any future agent-bearing surface). Mirrors the legacy AgentGroup colors.
const agentDotClass: Record<string, string> = {
  connected: styles.acpSessionItemAgentDotConnected,
  connecting: styles.acpSessionItemAgentDotConnecting,
  disconnected: styles.acpSessionItemAgentDotDisconnected,
  error: styles.acpSessionItemAgentDotError,
};

// ---------------------------------------------------------------------------
// SessionItem — renders a single session row
// ---------------------------------------------------------------------------

function SessionItem({ session, isActive, onSelect, agentName, agentStatus, showAgent }: {
  session: SessionMeta;
  isActive: boolean;
  onSelect?: (session: SessionMeta) => void;
  agentName?: string;
  agentStatus?: string;
  showAgent?: boolean;
}) {
  const { t } = useI18n();
  const formatTime = useFormatTime();
  const { selectSession, deleteSession, forkSession, setActiveSession } = useSessions();
  const status = useSessionStatus(session.id);
  const supportsFork = useAcpStore((s) => !!s.agents.get(session.agentId)?.capabilities?.sessionCapabilities?.fork);
  const supportsDelete = useAcpStore((s) => !!s.agents.get(session.agentId)?.capabilities?.sessionCapabilities?.delete);
  const [isForking, setIsForking] = useState(false);

  // Tracks an active native drag so the source row can dim, signalling where
  // the session is being dragged from. Cleared in onDragEnd (fires on drop,
  // escape, and every other drag termination).
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      className={`${styles.acpSessionItem}${isActive ? ` ${styles.acpSessionItemActive}` : ''}${isDragging ? ` ${styles.acpSessionItemDragging}` : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(SESSION_DRAG_MIME, session.id);
        e.dataTransfer.effectAllowed = 'copy';
        // Clean drag image: a title-only chip instead of the native ghost,
        // which would include the hover-revealed fork/delete buttons.
        setIsDragging(true);
        const preview = document.createElement('div');
        preview.className = styles.acpSessionDragPreview;
        preview.textContent = session.title || t('sessionList.defaultSessionTitle');
        preview.style.position = 'fixed';
        preview.style.top = '-1000px';
        document.body.appendChild(preview);
        e.dataTransfer.setDragImage(preview, 8, 8);
        // setDragImage snapshots the node synchronously; remove it on the
        // next tick so it never lingers in the DOM.
        setTimeout(() => preview.remove(), 0);
      }}
      onDragEnd={() => setIsDragging(false)}
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
        <div className={styles.acpSessionItemMeta}>
          {showAgent && agentName && (
            <span className={styles.acpSessionItemAgent}>
              <span className={`${styles.acpSessionItemAgentDot} ${agentDotClass[agentStatus ?? 'disconnected'] || ''}`} />
              {agentName}
            </span>
          )}
          <span className={styles.acpSessionItemTime}>{formatTime(session.updatedAt)}</span>
        </div>
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
// WorkspaceGroup — renders a workspace and its sessions (flat, no agent
// grouping). Agent name + connection dot are shown inline per session row
// only when the workspace holds sessions from more than one agent; the
// "new session" entry moved up into the workspace header.
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
  const { activeSessionId, createSession, setActiveSession, loadMoreSessions } = useSessions();
  const [collapsed, setCollapsed] = useState(false);
  const toggleCollapsed = useCallback(() => setCollapsed((v) => !v), []);

  const sessions = Array.from(workspace.sessions.values());

  // Flatten sessions across agents, newest first (stable secondary sort by id).
  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      if (tb !== ta) return tb - ta;
      return a.id < b.id ? -1 : 1;
    });
  }, [sessions]);

  // Show agent name + status dot inline only when the app is configured with
  // more than one agent — a global, stable signal (independent of which
  // sessions happen to exist in this workspace), so the label doesn't
  // flicker on/off as workspaces are added or sessions are created.
  const showAgent = agents.size > 1;

  const agentList = Array.from(agents.values());
  // Only one agent configured → "+" creates directly; multiple → pick via
  // dropdown. Consistent per app (not per-workspace): avoids the "+" flipping
  // between direct-create and picker as sessions come and go.
  const directNew = agentList.length === 1;

  // "Load more" — true if any agent in this workspace still has a cursor.
  const hasMore = useAcpStore(
    (s) => (s.workspaces.get(cwd)?.sessionListCursors?.size ?? 0) > 0,
  );
  const [loadingMore, setLoadingMore] = useState(false);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore) return;
    // Load the next page for every agent that still has a cursor in this
    // workspace; with agent grouping gone there is no single "owner" agent
    // for the button, so we fan out. loadMoreSessions is a no-op when the
    // cursor is already gone.
    const cursors = acpStore.getState().workspaces.get(cwd)?.sessionListCursors;
    if (!cursors) return;
    setLoadingMore(true);
    try {
      await Promise.all(
        Array.from(cursors.keys()).map((agentId) => loadMoreSessions(agentId, cwd)),
      );
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, loadMoreSessions, cwd]);

  const handleNewSession = useCallback(async (agentId?: string) => {
    // directNew callers omit agentId; dropdown callers pass it. With multiple
    // agents and no explicit pick there is no sensible default, so bail.
    const target = agentId ?? (agentList.length === 1 ? agentList[0].id : undefined);
    if (!target) return;
    try {
      const id = await createSession(target, cwd);
      setActiveSession(id);
    } catch (e) {
      console.error('Failed to create session:', e);
    }
  }, [agentList, createSession, setActiveSession, cwd]);

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
          {/* Folder icon doubles as the expand/collapse indicator: closed
              folder when collapsed, open folder when expanded. Saves the
              dedicated chevron column that used to sit to its left. */}
          <span className={`${styles.acpSessionWorkspaceHeaderFolder}${collapsed ? '' : ` ${styles.acpSessionWorkspaceHeaderFolderOpen}`}`}>
            {collapsed ? <FolderOutlined /> : <FolderOpenOutlined />}
          </span>
          <span className={styles.acpSessionWorkspaceHeaderName}>{getWorkspaceName(cwd)}</span>
        </span>
        <div className={styles.acpSessionWorkspaceHeaderActions}>
          {/* The wrapper stops click propagation so opening the menu / picker
              does not also toggle the workspace collapse (the trigger's
              onClick is swapped in by Dropdown.Trigger via cloneElement, so
              the stop must live on an ancestor). */}
          <span className={styles.acpSessionWorkspaceHeaderMoreWrap} onClick={(e) => e.stopPropagation()}>
            {directNew ? (
              <button
                className={styles.acpSessionWorkspaceHeaderAdd}
                onClick={() => void handleNewSession()}
                aria-label={t('sessionList.newSession')}
                title={t('sessionList.newSession')}
              >
                <PlusOutlined />
              </button>
            ) : (
              <Dropdown placement="bottom-end">
                <Dropdown.Trigger asChild>
                  <button
                    className={styles.acpSessionWorkspaceHeaderAdd}
                    aria-label={t('sessionList.newSession')}
                    title={t('sessionList.newSession')}
                  >
                    <PlusOutlined />
                  </button>
                </Dropdown.Trigger>
                <Dropdown.Content width={180}>
                  {agentList.map((agent) => (
                    <Dropdown.Item
                      key={agent.id}
                      label={getAgentName(agent)}
                      onClick={() => void handleNewSession(agent.id)}
                    />
                  ))}
                </Dropdown.Content>
              </Dropdown>
            )}
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
          {sortedSessions.map((s) => {
            const agent = agents.get(s.agentId);
            return (
              <SessionItem
                key={s.id}
                session={s}
                isActive={activeSessionId === s.id}
                onSelect={onSelectSession}
                agentName={getAgentName(agent ?? undefined)}
                agentStatus={agent?.status}
                showAgent={showAgent}
              />
            );
          })}
          {hasMore && (
            <div className={styles.acpSessionLoadMore}>
              <button
                className={styles.acpSessionLoadMoreBtn}
                onClick={() => void handleLoadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? '...' : t('sessionList.loadMore')}
              </button>
            </div>
          )}
          {sortedSessions.length === 0 && (
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
  const { workspaces, addWorkspace, activeWorkspaceCwd } = useWorkspaces();
  const { t } = useI18n();
  const { dialogs } = usePlatform();
  const openFilePicker = dialogs?.openFilePicker;

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
