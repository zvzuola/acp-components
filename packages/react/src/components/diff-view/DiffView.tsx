import React from 'react';
import { useI18n } from '../../i18n';
import styles from './diff-view.module.scss';

export interface DiffViewProps {
  diffs?: Array<{
    path: string;
    oldText?: string;
    newText: string;
  }>;
}

export function DiffView({ diffs = [] }: DiffViewProps) {
  const { t } = useI18n();
  if (diffs.length === 0) {
    return (
      <div className={styles.acpDiffView}>
        <div className={styles.acpDiffViewHeader}>{t('diff.title')}</div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--acp-color-text-muted)', fontSize: 13 }}>
          {t('diff.emptyState')}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.acpDiffView}>
      <div className={styles.acpDiffViewHeader}>{t('diff.title')}</div>
      <div className={styles.acpDiffViewContent}>
        {diffs.map((diff, i) => (
          <div key={i} className={styles.acpDiffViewFile}>
            <div className={styles.acpDiffViewFilename}>{diff.path}</div>
            {diff.oldText && (
              <div className={styles.acpDiffViewOld}>- {diff.oldText}</div>
            )}
            <div className={styles.acpDiffViewNew}>+ {diff.newText}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
