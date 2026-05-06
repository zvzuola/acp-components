import React from 'react';
import styles from './workbench.module.scss';

export interface WorkbenchProps {
  sidebar?: React.ReactNode;
  main?: React.ReactNode;
  panel?: React.ReactNode;
  className?: string;
}

export function Workbench({ sidebar, main, panel, className }: WorkbenchProps) {
  const hasPanel = !!panel;

  return (
    <div
      className={`${styles.acpWorkbench}${hasPanel ? ` ${styles.acpWorkbenchHasPanel}` : ''}${className ? ` ${className}` : ''}`}
      role="application"
      aria-label="ACP Workbench"
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
