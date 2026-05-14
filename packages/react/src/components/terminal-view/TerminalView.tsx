import React from 'react';
import { useI18n } from '../../i18n';
import styles from './terminal-view.module.scss';

export interface TerminalViewProps {
  output?: string;
  exitCode?: number | null;
}

export function TerminalView({ output = '', exitCode = null }: TerminalViewProps) {
  const { t } = useI18n();
  return (
    <div className={styles.acpTerminalView}>
      <div className={styles.acpTerminalViewHeader}>
        {t('terminal.title')}
        {exitCode !== null && ` ${t('terminal.exitCode', { code: exitCode })}`}
      </div>
      <pre className={styles.acpTerminalViewOutput}>{output || t('terminal.noOutput')}</pre>
    </div>
  );
}
