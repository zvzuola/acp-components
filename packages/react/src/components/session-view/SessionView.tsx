import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MenuFoldOutlined, MenuUnfoldOutlined, CloseOutlined } from '@ant-design/icons';
import type { SessionId } from '@acp-components/core';
import { useAcpStore } from '../../hooks/useAcpStore';
import { useFileTree } from '../../hooks/useFileTree';
import { useFileViewer } from '../../hooks/useFileViewer';
import { useResizable } from '../../hooks/useResizable';
import { useI18n } from '../../i18n';
import { ChatView } from '../chat-view/ChatView';
import { FileTree } from '../file-tree/FileTree';
import { FileViewer } from '../file-viewer/FileViewer';
import { ResizeHandle } from '../workbench/ResizeHandle';
import styles from './session-view.module.scss';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionViewTabId = string;

/**
 * A side-panel tab injected by the host (e.g. a terminal, diff viewer, or any
 * custom panel). The built-in Files tab (opened files + file tree) is always
 * rendered first; injected tabs follow in the order given.
 */
export interface SessionViewTab {
  /** Stable unique id (must not collide with the built-in: 'files') */
  id: SessionViewTabId;
  /** Tab label text */
  label: string;
  /** Optional leading icon */
  icon?: React.ReactNode;
  /** Tab body content */
  content: React.ReactNode;
  /** Provide to render a close affordance on the tab; called on close */
  onClose?: () => void;
  /** Disable the tab (still visible, not activatable) */
  disabled?: boolean;
}

export interface SessionViewProps {
  /** Active session id — passed through to the built-in ChatView */
  sessionId: SessionId | null;
  /** Host-injected tabs (terminal, diff, etc.). Appear after the built-ins. */
  tabs?: SessionViewTab[];
  /** Controlled active tab id. Defaults to 'files'. */
  activeTabId?: SessionViewTabId;
  onActiveTabChange?: (id: SessionViewTabId) => void;
  /** Controlled panel expansion. Defaults to true. */
  panelOpen?: boolean;
  onPanelOpenChange?: (open: boolean) => void;
  /** Initial / reset panel width in px (default 380) */
  panelWidth?: number;
  minPanelWidth?: number;
  maxPanelWidth?: number;
  onPanelWidthChange?: (width: number) => void;
  /** Toggle the built-in Files tab (opened files + file tree, two columns) */
  showFilesTab?: boolean;
  /** Extra class on the root */
  className?: string;
}

// Built-in tab id — exported so hosts can reference it when controlling
// activeTabId or injecting tabs without id collisions.
export const SESSION_VIEW_TAB_FILES = 'files';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive the cwd of the workspace holding the active session, if any. */
function useActiveCwd(sessionId: SessionId | null): string | null {
  return useAcpStore((s) => {
    if (!sessionId) return null;
    for (const [cwd, ws] of s.workspaces) {
      if (ws.sessions.has(sessionId)) return cwd;
    }
    return null;
  });
}

// ---------------------------------------------------------------------------
// Built-in tab bodies
// ---------------------------------------------------------------------------

interface FilesTabBodyProps {
  cwd: string | null;
  onNavigate?: (path: string, line?: number | null) => void;
}

function FilesTabBody({ cwd, onNavigate }: FilesTabBodyProps) {
  const { t } = useI18n();
  const { files, loading, error, load, onExpand, onCollapse } = useFileTree({
    cwd: cwd ?? '',
  });
  const { openFiles } = useFileViewer();

  // Lazy-load when entering the tab: a workspace surfaced via session switch
  // may not have been pre-loaded by <PlatformFileTreeAuto> yet.
  useEffect(() => {
    if (cwd && files.length === 0 && !loading && !error) {
      load();
    }
  }, [cwd, files.length, loading, error, load]);

  // Two-column split: opened files (left) | file tree (right), resizable.
  // The opened-files column is a left sidebar (handle on its right edge), so
  // direction 'left' means: dragging the pointer right grows the column.
  const innerResize = useResizable({
    initialWidth: 240,
    minWidth: 120,
    maxWidth: 480,
    direction: 'left',
  });

  // No workspace yet: the whole tab shows the empty state.
  if (!cwd) {
    return <div className={styles.acpSessionViewEmpty}>{t('sidebar.noWorkspace')}</div>;
  }

  // File-tree column content (kept inline so the column never disappears).
  let treeContent: React.ReactNode;
  if (error) {
    treeContent = <div className={styles.acpSessionViewEmpty}>Error: {error}</div>;
  } else if (loading && files.length === 0) {
    treeContent = <div className={styles.acpSessionViewEmpty}>{t('fileViewer.loading')}</div>;
  } else {
    treeContent = (
      <FileTree
        files={files}
        onExpand={onExpand}
        onCollapse={onCollapse}
        onNavigate={onNavigate}
      />
    );
  }

  // When there are no open files, hide the opened-files column and the
  // splitter entirely so the file tree fills the whole tab.
  const hasOpenedFiles = openFiles.length > 0;

  return (
    <div className={styles.acpSessionViewFilesColumns}>
      {hasOpenedFiles && (
        <>
          <div
            className={`${styles.acpSessionViewFilesCol} ${styles.acpSessionViewFilesColOpened}`}
            style={{ width: innerResize.width }}
          >
            <FileViewer />
          </div>
          <ResizeHandle
            {...innerResize.handleProps}
            isResizing={innerResize.isResizing}
            aria-label={t('sessionView.resizeFilesSplit')}
          />
        </>
      )}
      <div className={styles.acpSessionViewFilesCol}>{treeContent}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SessionView
// ---------------------------------------------------------------------------

export function SessionView({
  sessionId,
  tabs,
  activeTabId,
  onActiveTabChange,
  panelOpen,
  onPanelOpenChange,
  panelWidth = 380,
  minPanelWidth = 280,
  maxPanelWidth = 720,
  onPanelWidthChange,
  showFilesTab = true,
  className,
}: SessionViewProps) {
  const { t } = useI18n();
  const cwd = useActiveCwd(sessionId);
  const { openFile: navigateFile } = useFileViewer();

  // ── Panel expansion (controlled + default) ──────────────────────────
  const [internalOpen, setInternalOpen] = useState(true);
  const isOpen = panelOpen ?? internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (panelOpen === undefined) setInternalOpen(next);
      onPanelOpenChange?.(next);
    },
    [panelOpen, onPanelOpenChange],
  );

  // ── Resize (only mounted while open) ────────────────────────────────
  const panelResize = useResizable({
    initialWidth: panelWidth,
    minWidth: minPanelWidth,
    maxWidth: maxPanelWidth,
    direction: 'right',
    onChange: onPanelWidthChange,
  });

  // ── Tab list synthesis ──────────────────────────────────────────────
  const allTabs: SessionViewTab[] = useMemo(() => {
    const builtins: SessionViewTab[] = [];
    if (showFilesTab) {
      builtins.push({
        id: SESSION_VIEW_TAB_FILES,
        label: t('sessionView.tabFiles'),
        content: <FilesTabBody cwd={cwd} onNavigate={navigateFile} />,
      });
    }
    return [...builtins, ...(tabs ?? [])];
  }, [showFilesTab, tabs, cwd, navigateFile, t]);

  // ── Active tab (controlled + default + auto-fallback) ──────────────
  const [internalTab, setInternalTab] = useState<SessionViewTabId>(
    SESSION_VIEW_TAB_FILES,
  );
  const activeId = activeTabId ?? internalTab;

  // If the active tab disappeared (hidden / unmounted), fall back to the first
  // available tab — but keep the change internal so a controlled caller's
  // value isn't silently overwritten; we only notify.
  useEffect(() => {
    if (allTabs.length === 0) return;
    const exists = allTabs.some((tab) => tab.id === activeId && !tab.disabled);
    if (!exists) {
      const fallback = allTabs.find((tab) => !tab.disabled)?.id;
      if (fallback && fallback !== activeId) {
        if (activeTabId === undefined) setInternalTab(fallback);
        onActiveTabChange?.(fallback);
      }
    }
  }, [allTabs, activeId, activeTabId, onActiveTabChange]);

  const setActiveTab = useCallback(
    (id: SessionViewTabId) => {
      if (activeTabId === undefined) setInternalTab(id);
      onActiveTabChange?.(id);
    },
    [activeTabId, onActiveTabChange],
  );

  // ── Tab keyboard nav (arrow keys) ───────────────────────────────────
  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent, idx: number) => {
      const enabled = allTabs.filter((tab) => !tab.disabled);
      const currentEnabledIdx = enabled.findIndex((tab) => tab.id === activeId);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = enabled[(currentEnabledIdx + 1) % enabled.length];
        if (next) setActiveTab(next.id);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next =
          enabled[(currentEnabledIdx - 1 + enabled.length) % enabled.length];
        if (next) setActiveTab(next.id);
      } else if (e.key === 'Home') {
        e.preventDefault();
        if (enabled[0]) setActiveTab(enabled[0].id);
      } else if (e.key === 'End') {
        e.preventDefault();
        if (enabled[enabled.length - 1]) setActiveTab(enabled[enabled.length - 1].id);
      }
      void idx; // idx kept in signature for future use; not currently needed
    },
    [allTabs, activeId, setActiveTab],
  );

  const handleTabClose = useCallback(
    (e: React.MouseEvent, tab: SessionViewTab) => {
      e.stopPropagation();
      tab.onClose?.();
    },
    [],
  );

  const activeTab = allTabs.find((tab) => tab.id === activeId);

  const rootCls = [
    styles.acpSessionView,
    isOpen ? '' : styles.acpSessionViewCollapsed,
    className || '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={rootCls}
      role="application"
      aria-label={t('sessionView.ariaLabel')}
    >
      {/* ── Left: chat ──────────────────────────────────────────────── */}
      <div className={styles.acpSessionViewChat} role="main">
        <button
          type="button"
          className={styles.acpSessionViewToggle}
          onClick={() => setOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-label={isOpen ? t('sessionView.collapse') : t('sessionView.expand')}
          title={isOpen ? t('sessionView.collapse') : t('sessionView.expand')}
        >
          {isOpen ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
        </button>
        <ChatView sessionId={sessionId} onNavigateFile={navigateFile} />
      </div>

      {/* ── Right: collapsible tabbed panel ──────────────────────────── */}
      {isOpen && allTabs.length > 0 && (
        <>
          <ResizeHandle
            {...panelResize.handleProps}
            isResizing={panelResize.isResizing}
            aria-label={t('sessionView.resizePanel')}
            aria-valuenow={panelResize.width}
            aria-valuemin={minPanelWidth}
            aria-valuemax={maxPanelWidth}
          />
          <section
            className={styles.acpSessionViewPanel}
            role="complementary"
            style={{ width: panelResize.width }}
          >
            <div className={styles.acpSessionViewTabs} role="tablist" aria-label={t('sessionView.ariaLabel')}>
              {allTabs.map((tab, idx) => {
                const selected = tab.id === activeId;
                const cls = [
                  styles.acpSessionViewTab,
                  selected ? styles.acpSessionViewTabActive : '',
                  tab.disabled ? styles.acpSessionViewTabDisabled : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    id={`acp-session-view-tab-${tab.id}`}
                    aria-selected={selected}
                    aria-controls={`acp-session-view-panel-${tab.id}`}
                    tabIndex={selected ? 0 : -1}
                    className={cls}
                    disabled={tab.disabled}
                    onClick={() => !tab.disabled && setActiveTab(tab.id)}
                    onKeyDown={(e) => handleTabKeyDown(e, idx)}
                    title={tab.label}
                  >
                    {tab.icon && (
                      <span className={styles.acpSessionViewTabIcon} aria-hidden="true">
                        {tab.icon}
                      </span>
                    )}
                    <span className={styles.acpSessionViewTabLabel}>{tab.label}</span>
                    {tab.onClose && (
                      <span
                        className={styles.acpSessionViewTabClose}
                        role="button"
                        tabIndex={0}
                        aria-label={`${t('sessionView.closeTab')}: ${tab.label}`}
                        onClick={(e) => handleTabClose(e, tab)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            tab.onClose?.();
                          }
                        }}
                      >
                        <CloseOutlined />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div
              className={styles.acpSessionViewPanelBody}
              role="tabpanel"
              id={`acp-session-view-panel-${activeTab?.id ?? ''}`}
              aria-labelledby={
                activeTab ? `acp-session-view-tab-${activeTab.id}` : undefined
              }
              tabIndex={0}
            >
              {activeTab?.content}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
