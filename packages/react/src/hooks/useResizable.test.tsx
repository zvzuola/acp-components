import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useResizable } from './useResizable';

/**
 * Minimal fake pointer event — useResizable only reads `button`, `clientX`,
 * and calls `preventDefault`. We invoke the handle handlers directly (faster
 * than DOM fireEvent and avoids jsdom PointerEvent default-button quirks).
 */
interface FakeEvent {
  button?: number;
  clientX?: number;
  shiftKey?: boolean;
  key?: string;
  preventDefault?: () => void;
}
function ev(p: FakeEvent = {}): any {
  return { button: 0, clientX: 0, shiftKey: false, preventDefault: () => {}, ...p };
}

/** Simulate a full drag: pointerdown → document pointermove → document pointerup. */
function drag(result: ReturnType<typeof useResizable>, fromX: number, toX: number, button = 0): void {
  act(() => result.handleProps.onPointerDown(ev({ button, clientX: fromX })));
  act(() => {
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: toX } as any));
  });
  act(() => {
    document.dispatchEvent(new MouseEvent('pointerup', {} as any));
  });
}

/** Dispatch a document-level pointerup (the hook listens on `document`). */
function upPointer(): void {
  document.dispatchEvent(new MouseEvent('pointerup', {} as any));
}

describe('useResizable — pointer drag', () => {
  it('direction=left: moving right grows the width', () => {
    const { result } = renderHook(() => useResizable({ initialWidth: 200, direction: 'left' }));
    drag(result.current, 100, 150);
    expect(result.current.width).toBe(250);
  });

  it('direction=right: moving left grows the width', () => {
    const { result } = renderHook(() => useResizable({ initialWidth: 200, direction: 'right' }));
    drag(result.current, 200, 150);
    expect(result.current.width).toBe(250);
  });

  it('clamps to maxWidth', () => {
    const { result } = renderHook(() =>
      useResizable({ initialWidth: 200, direction: 'left', maxWidth: 220 }),
    );
    drag(result.current, 100, 400);
    expect(result.current.width).toBe(220);
  });

  it('clamps to minWidth', () => {
    const { result } = renderHook(() =>
      useResizable({ initialWidth: 200, direction: 'left', minWidth: 150 }),
    );
    drag(result.current, 100, 0);
    expect(result.current.width).toBe(150);
  });

  it('ignores non-primary button drags', () => {
    const { result } = renderHook(() => useResizable({ initialWidth: 200, direction: 'left' }));
    drag(result.current, 100, 300, /*button*/ 2);
    expect(result.current.width).toBe(200);
  });

  it('reports isResizing during the drag and clears it after', () => {
    const { result } = renderHook(() => useResizable({ initialWidth: 200, direction: 'left' }));
    act(() => result.current.handleProps.onPointerDown(ev({ clientX: 100 })));
    expect(result.current.isResizing).toBe(true);
    act(() => upPointer());
    expect(result.current.isResizing).toBe(false);
  });

  it('fires onChange with the clamped width', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useResizable({ initialWidth: 200, direction: 'left', onChange }),
    );
    drag(result.current, 100, 150);
    expect(onChange).toHaveBeenCalledWith(250);
  });
});

describe('useResizable — keyboard', () => {
  it('ArrowRight grows width by 10 (direction=left)', () => {
    const { result } = renderHook(() => useResizable({ initialWidth: 200, direction: 'left' }));
    act(() => result.current.handleProps.onKeyDown(ev({ key: 'ArrowRight' })));
    expect(result.current.width).toBe(210);
  });

  it('ArrowLeft shrinks width by 10 (direction=left)', () => {
    const { result } = renderHook(() => useResizable({ initialWidth: 200, direction: 'left' }));
    act(() => result.current.handleProps.onKeyDown(ev({ key: 'ArrowLeft' })));
    expect(result.current.width).toBe(190);
  });

  it('Shift+Arrow grows by 50', () => {
    const { result } = renderHook(() => useResizable({ initialWidth: 200, direction: 'left' }));
    act(() => result.current.handleProps.onKeyDown(ev({ key: 'ArrowRight', shiftKey: true })));
    expect(result.current.width).toBe(250);
  });

  it('Home sets minWidth, End sets maxWidth', () => {
    const { result } = renderHook(() =>
      useResizable({ initialWidth: 200, direction: 'left', minWidth: 150, maxWidth: 300 }),
    );
    act(() => result.current.handleProps.onKeyDown(ev({ key: 'Home' })));
    expect(result.current.width).toBe(150);
    act(() => result.current.handleProps.onKeyDown(ev({ key: 'End' })));
    expect(result.current.width).toBe(300);
  });

  it('ignores unrelated keys', () => {
    const { result } = renderHook(() => useResizable({ initialWidth: 200, direction: 'left' }));
    act(() => result.current.handleProps.onKeyDown(ev({ key: 'Enter' })));
    expect(result.current.width).toBe(200);
  });
});

describe('useResizable — reset / setWidth', () => {
  it('reset() returns to the initial width', () => {
    const { result } = renderHook(() => useResizable({ initialWidth: 200, direction: 'left' }));
    drag(result.current, 100, 150);
    expect(result.current.width).toBe(250);
    act(() => result.current.reset());
    expect(result.current.width).toBe(200);
  });

  it('setWidth clamps the provided value', () => {
    const { result } = renderHook(() =>
      useResizable({ initialWidth: 200, direction: 'left', minWidth: 100, maxWidth: 300 }),
    );
    act(() => result.current.setWidth(500));
    expect(result.current.width).toBe(300);
    act(() => result.current.setWidth(0));
    expect(result.current.width).toBe(100);
  });
});
