import { useState, useCallback, useRef, useEffect } from 'react';
import { useAcpStore } from '../../hooks/useAcpStore';
import { useI18n } from '../../i18n';
import styles from './project-opener.module.scss';

export interface ProjectOpenerProps {
  onBrowse?: () => Promise<string | null>;
}

export function ProjectOpener({ onBrowse }: ProjectOpenerProps) {
  const activeWorkspaceCwd = useAcpStore((s) => s.activeWorkspaceCwd);
  const workspaces = useAcpStore((s) => s.workspaces);
  const setActiveWorkspace = useAcpStore((s) => s.setActiveWorkspace);
  const removeWorkspace = useAcpStore((s) => s.removeWorkspace);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  const workspaceList = Array.from(workspaces.values());
  const activeWs = activeWorkspaceCwd ? workspaces.get(activeWorkspaceCwd) : null;

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown]);

  const handleSelect = useCallback((cwd: string) => {
    setActiveWorkspace(cwd);
    setShowDropdown(false);
  }, [setActiveWorkspace]);

  const handleRemove = useCallback((e: React.MouseEvent, cwd: string) => {
    e.stopPropagation();
    removeWorkspace(cwd);
  }, [removeWorkspace]);

  const handleSave = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed) {
      setActiveWorkspace(trimmed);
    }
    setEditing(false);
  }, [value, setActiveWorkspace]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setValue('');
      setEditing(false);
    }
  }, [handleSave]);

  const handleBrowse = useCallback(async () => {
    if (onBrowse) {
      const dir = await onBrowse();
      if (dir) {
        setActiveWorkspace(dir);
      }
    }
  }, [onBrowse, setActiveWorkspace]);

  const displayLabel = activeWs?.label || (activeWorkspaceCwd ? activeWorkspaceCwd.split(/[/\\]/).filter(Boolean).pop() || activeWorkspaceCwd : '');

  return (
    <div className={styles.acpProjectOpener}>
      <span className={styles.acpProjectOpenerIcon}>&#x1f4c1;</span>

      {editing ? (
        <input
          className={styles.acpProjectOpenerInput}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          placeholder={t('projectOpener.placeholder')}
          autoFocus
          aria-label={t('projectOpener.ariaLabel')}
        />
      ) : (
        <div className={styles.acpProjectOpenerDropdown} ref={dropdownRef}>
          <span
            className={styles.acpProjectOpenerPath}
            onClick={() => setShowDropdown(!showDropdown)}
            title={activeWorkspaceCwd || t('projectOpener.noProject')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowDropdown(!showDropdown); }}
          >
            {displayLabel || t('projectOpener.noProject')}
            {workspaceList.length > 1 && (
              <span className={styles.acpProjectOpenerChevron}>{showDropdown ? '▲' : '▼'}</span>
            )}
          </span>

          {showDropdown && workspaceList.length > 0 && (
            <div className={styles.acpProjectOpenerMenu}>
              {workspaceList.map((ws) => (
                <div
                  key={ws.cwd}
                  className={`${styles.acpProjectOpenerMenuItem}${ws.cwd === activeWorkspaceCwd ? ` ${styles.acpProjectOpenerMenuItemActive}` : ''}`}
                  onClick={() => handleSelect(ws.cwd)}
                  role="option"
                  aria-selected={ws.cwd === activeWorkspaceCwd}
                >
                  <span className={styles.acpProjectOpenerMenuItemLabel}>
                    {ws.label || ws.cwd.split(/[/\\]/).filter(Boolean).pop() || ws.cwd}
                  </span>
                  <span className={styles.acpProjectOpenerMenuItemPath}>{ws.cwd}</span>
                  {workspaceList.length > 1 && (
                    <button
                      className={styles.acpProjectOpenerMenuItemRemove}
                      onClick={(e) => handleRemove(e, ws.cwd)}
                      aria-label={t('workspace.removeWorkspace')}
                      title={t('workspace.removeWorkspace')}
                    >
                      &#x2715;
                    </button>
                  )}
                </div>
              ))}
              <div className={styles.acpProjectOpenerMenuDivider} />
              <div
                className={styles.acpProjectOpenerMenuItem}
                onClick={() => { setShowDropdown(false); setEditing(true); setValue(''); }}
              >
                <span className={styles.acpProjectOpenerMenuItemLabel}>+ {t('workspace.addWorkspace')}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {onBrowse && (
        <button
          className={styles.acpProjectOpenerBrowse}
          onClick={handleBrowse}
          aria-label={t('projectOpener.browseAriaLabel')}
          title={t('projectOpener.browse')}
        >
          &#x2026;
        </button>
      )}
    </div>
  );
}
