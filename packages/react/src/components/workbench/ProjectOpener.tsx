import React, { useState, useCallback, useEffect } from 'react';
import { useAcpStore } from '../../hooks/useAcpStore';
import styles from './project-opener.module.scss';

export interface ProjectOpenerProps {
  onBrowse?: () => Promise<string | null>;
}

export function ProjectOpener({ onBrowse }: ProjectOpenerProps) {
  const projectCwd = useAcpStore((s) => s.projectCwd);
  const setProjectCwd = useAcpStore((s) => s.setProjectCwd);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(projectCwd);

  useEffect(() => {
    setValue(projectCwd);
  }, [projectCwd]);

  const handleSave = useCallback(() => {
    setProjectCwd(value.trim());
    setEditing(false);
  }, [value, setProjectCwd]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setValue(projectCwd);
      setEditing(false);
    }
  }, [handleSave, projectCwd]);

  const handleBrowse = useCallback(async () => {
    if (onBrowse) {
      const dir = await onBrowse();
      if (dir) {
        setProjectCwd(dir);
      }
    }
  }, [onBrowse]);

  const displayCwd = projectCwd || 'No project opened';

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
          placeholder="/path/to/project"
          autoFocus
          aria-label="Project directory"
        />
      ) : (
        <span
          className={styles.acpProjectOpenerPath}
          onClick={() => { setEditing(true); setValue(projectCwd); }}
          title={displayCwd}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setEditing(true); setValue(projectCwd); } }}
        >
          {displayCwd}
        </span>
      )}
      {onBrowse && (
        <button
          className={styles.acpProjectOpenerBrowse}
          onClick={handleBrowse}
          aria-label="Browse for project"
          title="Browse..."
        >
          &#x2026;
        </button>
      )}
    </div>
  );
}
