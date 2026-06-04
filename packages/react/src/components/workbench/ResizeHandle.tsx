import React, { useCallback } from 'react';
import styles from './resize-handle.module.scss';

export interface ResizeHandleProps {
  /** Props from useResizable handleProps (onPointerDown, onDoubleClick, onKeyDown) */
  onPointerDown: (e: React.PointerEvent) => void;
  onDoubleClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  /** Whether the handle is currently being dragged */
  isResizing?: boolean;
  /** Optional aria label for screen readers */
  'aria-label'?: string;
  /** Optional aria-valuenow (current width) */
  'aria-valuenow'?: number;
  /** Optional aria-valuemin */
  'aria-valuemin'?: number;
  /** Optional aria-valuemax */
  'aria-valuemax'?: number;
  /** Extra className */
  className?: string;
}

export function ResizeHandle({
  onPointerDown,
  onDoubleClick,
  onKeyDown,
  isResizing,
  'aria-label': ariaLabel = 'Resize panel',
  'aria-valuenow': valueNow,
  'aria-valuemin': valueMin,
  'aria-valuemax': valueMax,
  className,
}: ResizeHandleProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown(e);
    },
    [onKeyDown],
  );

  const cls = [
    styles.resizeHandle,
    isResizing ? styles.resizeHandleActive : '',
    className || '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      aria-valuenow={valueNow}
      aria-valuemin={valueMin}
      aria-valuemax={valueMax}
      tabIndex={0}
      className={cls}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onKeyDown={handleKeyDown}
    >
      <span className={styles.resizeHandleLine} aria-hidden="true" />
    </div>
  );
}
