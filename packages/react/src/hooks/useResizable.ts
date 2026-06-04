import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseResizableOptions {
  /** Initial width in pixels */
  initialWidth: number;
  /** Minimum width in pixels */
  minWidth?: number;
  /** Maximum width in pixels */
  maxWidth?: number;
  /**
   * Drag direction semantics:
   * - 'left': moving pointer right increases width (sidebar on the left)
   * - 'right': moving pointer left increases width (panel on the right)
   */
  direction: 'left' | 'right';
  /** Called while dragging */
  onChange?: (width: number) => void;
}

export interface UseResizableReturn {
  width: number;
  isResizing: boolean;
  /** Reset to initial width */
  reset: () => void;
  /** Imperatively set width (clamped) */
  setWidth: (w: number) => void;
  /** Props to spread on the drag handle element */
  handleProps: {
    onPointerDown: (e: React.PointerEvent) => void;
    onDoubleClick: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function useResizable({
  initialWidth,
  minWidth = 120,
  maxWidth = 800,
  direction,
  onChange,
}: UseResizableOptions): UseResizableReturn {
  const [width, setWidthState] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);

  const widthRef = useRef(width);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Keep ref in sync
  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  const commitWidth = useCallback(
    (newWidth: number) => {
      const clamped = clamp(Math.round(newWidth), minWidth, maxWidth);
      setWidthState(clamped);
      onChange?.(clamped);
    },
    [minWidth, maxWidth, onChange],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only primary button
      if (e.button !== 0) return;
      e.preventDefault();

      startXRef.current = e.clientX;
      startWidthRef.current = widthRef.current;
      setIsResizing(true);

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.body.classList.add('acp-resizing');

      const handlePointerMove = (ev: PointerEvent) => {
        const delta = direction === 'left'
          ? ev.clientX - startXRef.current
          : startXRef.current - ev.clientX;
        commitWidth(startWidthRef.current + delta);
      };

      const handlePointerUp = () => {
        setIsResizing(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.body.classList.remove('acp-resizing');
        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);
      };

      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
    },
    [direction, commitWidth],
  );

  const onDoubleClick = useCallback(() => {
    commitWidth(initialWidth);
  }, [initialWidth, commitWidth]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = e.shiftKey ? 50 : 10;
      let handled = true;

      switch (e.key) {
        case 'ArrowLeft':
          commitWidth(widthRef.current + (direction === 'left' ? -step : step));
          break;
        case 'ArrowRight':
          commitWidth(widthRef.current + (direction === 'left' ? step : -step));
          break;
        case 'Home':
          commitWidth(minWidth);
          break;
        case 'End':
          commitWidth(maxWidth);
          break;
        default:
          handled = false;
      }

      if (handled) e.preventDefault();
    },
    [direction, commitWidth, minWidth, maxWidth],
  );

  return {
    width,
    isResizing,
    reset: onDoubleClick,
    setWidth: commitWidth,
    handleProps: { onPointerDown, onDoubleClick, onKeyDown },
  };
}
