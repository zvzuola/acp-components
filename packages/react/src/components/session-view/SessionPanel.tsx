import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CloseOutlined } from '@ant-design/icons';
import { useFileTree } from '../../hooks/useFileTree';
import { useFileViewer } from '../../hooks/useFileViewer';
import { useResizable } from '../../hooks/useResizable';
import { useI18n } from '../../i18n';
import { FileTree } from '../file-tree/FileTree';
import { FileViewer } from '../file-viewer/FileViewer';
import { ResizeHandle } from '../workbench/ResizeHandle';
import styles from './session-panel.module.scss';

// ---------------------------------------------------------------------------
// Types (re-exported by SessionView for the public API)
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

// Built-in tab id — exported so hosts can reference it when controlling
// activeTabId or injecting tabs without id collisions.
export const SESSION_VIEW_TAB_FILES = 'files';

// ---------------------------------------------------------------------------
// Files tab body
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
  const innerResize = useResizable({
    initialWidth: 240,
    minWidth: 120,
    maxWidth: 480,
    direction: 'right',
  });

  if (!cwd) {
    return <div className={styles.acpSessionPanelEmpty}>{t('sidebar.noWorkspace')}</div>;
  }

  let treeContent: React.ReactNode;
  if (error) {
    treeContent = <div className={styles.acpSessionPanelEmpty}>Error: {error}</div>;
  } else if (loading && files.length === 0) {
    treeContent = <div className={styles.acpSessionPanelEmpty}>{t('fileViewer.loading')}</div>;
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

  const hasOpenedFiles = openFiles.length > 0;

  return (
    <div className={styles.acpSessionPanelFilesColumns}>
      {hasOpenedFiles && (
        <>
          <div
            className={`${styles.acpSessionPanelFilesCol} ${styles.acpSessionPanelFilesColOpened}`}
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
      <div
        className={styles.acpSessionPanelFilesCol}
        style={hasOpenedFiles ? { width: innerResize.width } : { flex: '1 1 0' }}
      >
        {treeContent}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SessionPanel — collapsible tabbed side panel
// ---------------------------------------------------------------------------

export interface SessionPanelProps {
  /** Cwd of the active session's workspace (for the file tree). */
  cwd: string | null;
  /** Host-injected tabs (terminal, diff, etc.). Appear after the built-ins. */
  tabs?: SessionViewTab[];
  /** Controlled active tab id. Defaults to 'files'. */
  activeTabId?: SessionViewTabId;
  onActiveTabChange?: (id: SessionViewTabId) => void;
  /** Toggle the built-in Files tab (opened files + file tree). */
  showFilesTab?: boolean;
  /** Initial / reset panel width in px (default 380) */
  panelWidth?: number;
  minPanelWidth?: number;
  maxPanelWidth?: number;
  onPanelWidthChange?: (width: number) => void;
  /** File-open handler for the file tree. */
  onNavigate?: (path: string, line?: number | null) => void;
}

export function SessionPanel({
  cwd,
  tabs,
  activeTabId,
  onActiveTabChange,
  showFilesTab = true,
  panelWidth = 380,
  minPanelWidth = 280,
  maxPanelWidth = 720,
  onPanelWidthChange,
  onNavigate,
}: SessionPanelProps) {
  const { t } = useI18n();
  const { openFile: navigateFile } = useFileViewer();
  const resolvedNavigate = onNavigate ?? navigateFile;

  // Resize
  const panelResize = useResizable({
    initialWidth: panelWidth,
    minWidth: minPanelWidth,
    maxWidth: maxPanelWidth,
    direction: 'right',
    onChange: onPanelWidthChange,
  });

  // Tab list synthesis
  const allTabs: SessionViewTab[] = useMemo(() => {
    const builtins: SessionViewTab[] = [];
    if (showFilesTab) {
      builtins.push({
        id: SESSION_VIEW_TAB_FILES,
        label: t('sessionView.tabFiles'),
        content: <FilesTabBody cwd={cwd} onNavigate={resolvedNavigate} />,
      });
    }
    return [...builtins, ...(tabs ?? [])];
  }, [showFilesTab, tabs, cwd, resolvedNavigate, t]);

  // Active tab (controlled + default + auto-fallback)
  const [internalTab, setInternalTab] = useState<SessionViewTabId>(
    SESSION_VIEW_TAB_FILES,
  );
  const activeId = activeTabId ?? internalTab;

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

  // Tab keyboard nav (arrow keys)
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
      void idx;
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

  if (allTabs.length === 0) return null;

  return (
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
        className={styles.acpSessionPanel}
        role="complementary"
        style={{ width: panelResize.width }}
      >
        <div className={styles.acpSessionPanelTabs} role="tablist" aria-label={t('sessionView.ariaLabel')}>
          {allTabs.map((tab, idx) => {
            const selected = tab.id === activeId;
            const cls = [
              styles.acpSessionPanelTab,
              selected ? styles.acpSessionPanelTabActive : '',
              tab.disabled ? styles.acpSessionPanelTabDisabled : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`acp-session-panel-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`acp-session-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                className={cls}
                disabled={tab.disabled}
                onClick={() => !tab.disabled && setActiveTab(tab.id)}
                onKeyDown={(e) => handleTabKeyDown(e, idx)}
                title={tab.label}
              >
                {tab.icon && (
                  <span className={styles.acpSessionPanelTabIcon} aria-hidden="true">
                    {tab.icon}
                  </span>
                )}
                <span className={styles.acpSessionPanelTabLabel}>{tab.label}</span>
                {tab.onClose && (
                  <span
                    className={styles.acpSessionPanelTabClose}
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
          className={styles.acpSessionPanelBody}
          role="tabpanel"
          id={`acp-session-panel-${activeTab?.id ?? ''}`}
          aria-labelledby={
            activeTab ? `acp-session-panel-tab-${activeTab.id}` : undefined
          }
          tabIndex={0}
        >
          {activeTab?.content}
        </div>
      </section>
    </>
  );
}
