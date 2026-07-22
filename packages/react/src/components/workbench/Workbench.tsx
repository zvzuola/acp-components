import React from 'react';
import { useI18n } from '../../i18n';
import { useResizable } from '../../hooks/useResizable';
import { ResizeHandle } from './ResizeHandle';
import styles from './workbench.module.scss';

export interface WorkbenchProps {
  sidebar?: React.ReactNode;
  main?: React.ReactNode;
  className?: string;
  /** Initial sidebar width in pixels (default: 260) */
  sidebarWidth?: number;
  /** Minimum sidebar width (default: 180) */
  minSidebarWidth?: number;
  /** Maximum sidebar width (default: 480) */
  maxSidebarWidth?: number;
  /** Called when sidebar width changes during drag */
  onSidebarWidthChange?: (width: number) => void;
}

export function Workbench({
  sidebar,
  main,
  className,
  sidebarWidth = 260,
  minSidebarWidth = 180,
  maxSidebarWidth = 480,
  onSidebarWidthChange,
}: WorkbenchProps) {
  const { t } = useI18n();

  const sidebarResize = useResizable({
    initialWidth: sidebarWidth,
    minWidth: minSidebarWidth,
    maxWidth: maxSidebarWidth,
    direction: 'left',
    onChange: onSidebarWidthChange,
  });

  return (
    <div
      className={`${styles.acpWorkbench}${className ? ` ${className}` : ''}`}
      role="application"
      aria-label={t('workbench.ariaLabel')}
    >
      <aside
        className={styles.acpWorkbenchSidebar}
        role="complementary"
        style={{ width: sidebarResize.width }}
      >
        {sidebar}
      </aside>
      <ResizeHandle
        {...sidebarResize.handleProps}
        isResizing={sidebarResize.isResizing}
        aria-label={t('workbench.resizeSidebar')}
        aria-valuenow={sidebarResize.width}
        aria-valuemin={minSidebarWidth}
        aria-valuemax={maxSidebarWidth}
      />
      <main className={styles.acpWorkbenchMain} role="main">
        {main}
      </main>
    </div>
  );
}
