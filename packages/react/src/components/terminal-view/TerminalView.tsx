import React from 'react';
import styles from './terminal-view.module.scss';

export interface TerminalViewProps {
  output?: string;
  exitCode?: number | null;
}

export function TerminalView({ output = '', exitCode = null }: TerminalViewProps) {
  return (
    <div className={styles.acpTerminalView}>
      <div className={styles.acpTerminalViewHeader}>
        Terminal
        {exitCode !== null && ` (exit: ${exitCode})`}
      </div>
      <pre className={styles.acpTerminalViewOutput}>{output || 'No output'}</pre>
    </div>
  );
}
