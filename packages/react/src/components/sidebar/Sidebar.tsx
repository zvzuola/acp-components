import { useState, useCallback } from 'react';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useAcpStore } from '../../hooks/useAcpStore';
import { useFileTree } from '../../hooks/useFileTree';
import { SessionList } from '../session-list';
import { SettingsMenu } from '../settings-menu/SettingsMenu';
import { FileTree } from '../file-tree';
import { useI18n } from '../../i18n';
import styles from './sidebar.module.scss';

export interface SidebarProps {
  onBrowse?: () => Promise<string | null>;
  onNavigateFile?: (path: string, line?: number | null) => void;
  className?: string;
}

function getWorkspaceName(cwd: string): string {
  const normalized = cwd.replace(/[/\\]+$/, '');
  const parts = normalized.split(/[/\\]/);
  return parts[parts.length - 1] || cwd;
}

function FileTreeView({ cwd, onNavigateFile, onBack }: {
  cwd: string;
  onNavigateFile?: (path: string, line?: number | null) => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const { files, loading, error, onExpand, onCollapse } = useFileTree({ cwd });

  return (
    <div className={styles.acpSidebarFiles}>
      <div className={styles.acpSidebarFilesHeader}>
        <button
          className={styles.acpSidebarFilesBack}
          onClick={onBack}
          aria-label={t('sidebar.backToSessions')}
          title={t('sidebar.backToSessions')}
        >
          <ArrowLeftOutlined />
        </button>
        <span className={styles.acpSidebarFilesTitle}>
          {t('sidebar.filesTitle')}
        </span>
        <span className={styles.acpSidebarFilesName}>
          {getWorkspaceName(cwd)}
        </span>
      </div>
      <div className={styles.acpSidebarFilesBody}>
        {error ? (
          <div className={styles.acpSidebarFilesError}>
            Error: {error}
          </div>
        ) : loading && files.length === 0 ? (
          <div className={styles.acpSidebarFilesLoading}>
            Loading...
          </div>
        ) : (
          <FileTree
            files={files}
            onExpand={onExpand}
            onCollapse={onCollapse}
            onNavigate={onNavigateFile}
          />
        )}
      </div>
    </div>
  );
}

export function Sidebar({ onBrowse, onNavigateFile, className }: SidebarProps) {
  const { t } = useI18n();
  const [view, setView] = useState<'sessions' | 'files'>('sessions');
  const [filesCwd, setFilesCwd] = useState<string | null>(null);

  const activeCwd = useAcpStore((s) => {
    if (!s.activeSessionId) return null;
    for (const [cwd, ws] of s.workspaces) {
      if (ws.sessions.has(s.activeSessionId)) return cwd;
    }
    return null;
  });

  const handleShowFiles = useCallback((cwd: string) => {
    setFilesCwd(cwd);
    setView('files');
  }, []);

  const handleBackToSessions = useCallback(() => {
    setView('sessions');
  }, []);

  const cwdToShow = filesCwd || activeCwd;

  return (
    <div className={`${styles.acpSidebar}${className ? ` ${className}` : ''}`}>
      {view === 'sessions' ? (
        <>
          <div className={styles.acpSidebarSessions}>
            <SessionList onBrowse={onBrowse} onShowFiles={handleShowFiles} />
          </div>
          <SettingsMenu />
        </>
      ) : cwdToShow ? (
        <FileTreeView
          cwd={cwdToShow}
          onNavigateFile={onNavigateFile}
          onBack={handleBackToSessions}
        />
      ) : (
        <div className={styles.acpSidebarEmpty}>
          <button
            className={styles.acpSidebarEmptyBack}
            onClick={handleBackToSessions}
            aria-label={t('sidebar.backToSessions')}
          >
            <ArrowLeftOutlined />
          </button>
          {t('sidebar.noWorkspace')}
        </div>
      )}
    </div>
  );
}
