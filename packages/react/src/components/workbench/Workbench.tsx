import React from 'react';
import { useI18n } from '../../i18n';
import styles from './workbench.module.scss';

export interface WorkbenchProps {
  sidebar?: React.ReactNode;
  main?: React.ReactNode;
  panel?: React.ReactNode;
  className?: string;
}

export function Workbench({ sidebar, main, panel, className }: WorkbenchProps) {
  const hasPanel = !!panel;
  const { t } = useI18n();

  return (
    <div
      className={`${styles.acpWorkbench}${hasPanel ? ` ${styles.acpWorkbenchHasPanel}` : ''}${className ? ` ${className}` : ''}`}
      role="application"
      aria-label={t('workbench.ariaLabel')}
    >
      <aside className={styles.acpWorkbenchSidebar} role="complementary">
        {sidebar}
      </aside>
      <main className={styles.acpWorkbenchMain} role="main">
        {main}
      </main>
      {hasPanel && (
        <section className={styles.acpWorkbenchPanel} role="complementary">
          {panel}
        </section>
      )}
    </div>
  );
}
