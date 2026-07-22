import React, { useCallback, useState } from 'react';
import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import type { SessionId } from '@acp-components/core';
import { useAcpStore } from '../../hooks/useAcpStore';
import { useFileViewer } from '../../hooks/useFileViewer';
import { useI18n } from '../../i18n';
import { SessionPanes } from './SessionPanes';
import { SessionPanel } from './SessionPanel';
import type { SessionViewTab, SessionViewTabId } from './SessionPanel';
import paneStyles from './session-panes.module.scss';
import styles from './session-view.module.scss';

// ---------------------------------------------------------------------------
// Types (re-exported from SessionPanel for backward-compatible public API)
// ---------------------------------------------------------------------------

export type { SessionViewTab, SessionViewTabId } from './SessionPanel';
export { SESSION_VIEW_TAB_FILES } from './SessionPanel';

export interface SessionViewProps {
  /** Active session id — passed through to SessionPanes */
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
  /** Override the file-open handler passed down to ChatView / SessionPanel. */
  onNavigateFile?: (path: string, line?: number | null) => void;
}

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
// SessionView — orchestrates SessionPanes (left) + SessionPanel (right)
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
  maxPanelWidth = 900,
  onPanelWidthChange,
  showFilesTab = true,
  className,
  onNavigateFile,
}: SessionViewProps) {
  const { t } = useI18n();
  const { openFile: navigateFile } = useFileViewer();
  const resolvedNavigateFile = onNavigateFile ?? navigateFile;

  // Panel expansion (controlled + default)
  const [internalOpen, setInternalOpen] = useState(true);
  const isOpen = panelOpen ?? internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (panelOpen === undefined) setInternalOpen(next);
      onPanelOpenChange?.(next);
    },
    [panelOpen, onPanelOpenChange],
  );

  // Derive the cwd of the workspace holding the active session
  const cwd = useActiveCwd(sessionId);

  const showPanel = isOpen;

  const rootCls = [styles.acpSessionView, className || '']
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={rootCls}
      role="application"
      aria-label={t('sessionView.ariaLabel')}
    >
      <SessionPanes
        sessionId={sessionId}
        onNavigateFile={resolvedNavigateFile}
        headerExtras={
          <button
            type="button"
            className={paneStyles.acpSplitPaneBtn}
            onClick={() => setOpen(!isOpen)}
            aria-expanded={isOpen}
            aria-label={isOpen ? t('sessionView.collapse') : t('sessionView.expand')}
            title={isOpen ? t('sessionView.collapse') : t('sessionView.expand')}
          >
            {isOpen ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
          </button>
        }
      />
      {showPanel && (
        <SessionPanel
          cwd={cwd}
          tabs={tabs}
          activeTabId={activeTabId}
          onActiveTabChange={onActiveTabChange}
          showFilesTab={showFilesTab}
          panelWidth={panelWidth}
          minPanelWidth={minPanelWidth}
          maxPanelWidth={maxPanelWidth}
          onPanelWidthChange={onPanelWidthChange}
          onNavigate={resolvedNavigateFile}
        />
      )}
    </div>
  );
}
