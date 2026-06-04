import React from 'react';
import { useI18n } from '../../i18n';
import { useResizable } from '../../hooks/useResizable';
import { ResizeHandle } from './ResizeHandle';
import styles from './workbench.module.scss';

export interface WorkbenchProps {
  sidebar?: React.ReactNode;
  main?: React.ReactNode;
  panel?: React.ReactNode;
  className?: string;
  /** Initial sidebar width in pixels (default: 260) */
  sidebarWidth?: number;
  /** Initial panel width in pixels (default: 360) */
  panelWidth?: number;
  /** Minimum sidebar width (default: 180) */
  minSidebarWidth?: number;
  /** Maximum sidebar width (default: 480) */
  maxSidebarWidth?: number;
  /** Minimum panel width (default: 240) */
  minPanelWidth?: number;
  /** Maximum panel width (default: 600) */
  maxPanelWidth?: number;
  /** Called when sidebar width changes during drag */
  onSidebarWidthChange?: (width: number) => void;
  /** Called when panel width changes during drag */
  onPanelWidthChange?: (width: number) => void;
}

export function Workbench({
  sidebar,
  main,
  panel,
  className,
  sidebarWidth = 260,
  panelWidth = 360,
  minSidebarWidth = 180,
  maxSidebarWidth = 480,
  minPanelWidth = 240,
  maxPanelWidth = 600,
  onSidebarWidthChange,
  onPanelWidthChange,
}: WorkbenchProps) {
  const hasPanel = !!panel;
  const { t } = useI18n();

  const sidebarResize = useResizable({
    initialWidth: sidebarWidth,
    minWidth: minSidebarWidth,
    maxWidth: maxSidebarWidth,
    direction: 'left',
    onChange: onSidebarWidthChange,
  });

  const panelResize = useResizable({
    initialWidth: panelWidth,
    minWidth: minPanelWidth,
    maxWidth: maxPanelWidth,
    direction: 'right',
    onChange: onPanelWidthChange,
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
      {hasPanel && (
        <>
          <ResizeHandle
            {...panelResize.handleProps}
            isResizing={panelResize.isResizing}
            aria-label={t('workbench.resizePanel')}
            aria-valuenow={panelResize.width}
            aria-valuemin={minPanelWidth}
            aria-valuemax={maxPanelWidth}
          />
          <section
            className={styles.acpWorkbenchPanel}
            role="complementary"
            style={{ width: panelResize.width }}
          >
            {panel}
          </section>
        </>
      )}
    </div>
  );
}
