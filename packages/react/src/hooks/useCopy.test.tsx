import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { useCopy } from './useCopy';
import { PlatformContext } from '../context/PlatformContext';
import type { Platform } from '../context/PlatformContext';

/** Wrap useCopy with a Platform provider so the platform-clipboard path is
 *  exercised alongside the navigator.clipboard fallback. */
function withPlatform(platform: Platform | null) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      PlatformContext.Provider,
      { value: platform },
      children,
    );
}

describe('useCopy', () => {
  let originalClipboard: Clipboard | undefined;
  let writeTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    originalClipboard = navigator.clipboard;
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
  });

  it('sets copied=true after a successful write, then resets after timeout', async () => {
    const { result } = renderHook(() => useCopy());

    await act(async () => {
      await result.current.copy('hello');
    });

    expect(result.current.copied).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith('hello');

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.copied).toBe(false);
  });

  it('prefers platform clipboard over navigator.clipboard', async () => {
    const platformWriteText = vi.fn().mockResolvedValue(undefined);
    const platform: Platform = {
      platform: 'web',
      os: undefined,
      storage: (() => ({}) as any) as any,
      clipboard: { writeText: platformWriteText },
    };

    const { result } = renderHook(() => useCopy(), {
      wrapper: withPlatform(platform),
    });

    await act(async () => {
      await result.current.copy('from platform');
    });

    expect(platformWriteText).toHaveBeenCalledWith('from platform');
    expect(writeTextMock).not.toHaveBeenCalled();
    expect(result.current.copied).toBe(true);
  });

  it('falls back to navigator.clipboard when no platform slice', async () => {
    const { result } = renderHook(() => useCopy(), {
      wrapper: withPlatform(null),
    });

    await act(async () => {
      await result.current.copy('fallback');
    });

    expect(writeTextMock).toHaveBeenCalledWith('fallback');
    expect(result.current.copied).toBe(true);
  });

  it('leaves copied=false when clipboard write rejects', async () => {
    writeTextMock.mockRejectedValue(new Error('denied'));
    const { result } = renderHook(() => useCopy(), {
      wrapper: withPlatform(null),
    });

    await act(async () => {
      await result.current.copy('will fail');
    });

    expect(result.current.copied).toBe(false);
  });
});
