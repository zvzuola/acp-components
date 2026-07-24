import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { useHotkey, useHotkeys, __resetHotkeyRegistry } from './useHotkey';
import { PlatformContext } from '../context/PlatformContext';
import type { Platform } from '../context/PlatformContext';

/** Fire a keydown event on document with the given key + modifiers. */
function fireKey(
  key: string,
  mods: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {},
): void {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...mods,
  });
  document.dispatchEvent(event);
}

function withPlatform(platform: Platform | null) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      PlatformContext.Provider,
      { value: platform },
      children,
    );
}

const macPlatform: Platform = {
  platform: 'desktop',
  os: 'macos',
  storage: (() => ({})) as any,
};

const winPlatform: Platform = {
  platform: 'desktop',
  os: 'windows',
  storage: (() => ({})) as any,
};

describe('useHotkey', () => {
  beforeEach(() => {
    __resetHotkeyRegistry();
  });

  afterEach(() => {
    __resetHotkeyRegistry();
  });

  it('calls handler when the shortcut fires (Mod+K on macOS = Cmd)', () => {
    const handler = vi.fn();
    renderHook(() => useHotkey('Mod+K', handler), {
      wrapper: withPlatform(macPlatform),
    });

    fireKey('k', { metaKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('calls handler when the shortcut fires (Mod+K on Windows = Ctrl)', () => {
    const handler = vi.fn();
    renderHook(() => useHotkey('Mod+K', handler), {
      wrapper: withPlatform(winPlatform),
    });

    fireKey('k', { ctrlKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire on wrong modifier (Ctrl on macOS)', () => {
    const handler = vi.fn();
    renderHook(() => useHotkey('Mod+K', handler), {
      wrapper: withPlatform(macPlatform),
    });

    fireKey('k', { ctrlKey: true });
    expect(handler).not.toHaveBeenCalled();
  });

  it('fires on bare Enter only without modifiers', () => {
    const handler = vi.fn();
    renderHook(() => useHotkey('Enter', handler), {
      wrapper: withPlatform(macPlatform),
    });

    fireKey('Enter');
    expect(handler).toHaveBeenCalledTimes(1);

    fireKey('Enter', { metaKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not fire when focus is in an input (default)', () => {
    const handler = vi.fn();
    renderHook(() => useHotkey('Mod+K', handler), {
      wrapper: withPlatform(macPlatform),
    });

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);

    expect(handler).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('fires in input when allowInInput is true', () => {
    const handler = vi.fn();
    renderHook(
      () => useHotkey('Mod+K', handler, { allowInInput: true }),
      { wrapper: withPlatform(macPlatform) },
    );

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
    document.body.removeChild(input);
  });

  it('unregisters on unmount', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useHotkey('Mod+K', handler), {
      wrapper: withPlatform(macPlatform),
    });

    unmount();
    fireKey('k', { metaKey: true });
    expect(handler).not.toHaveBeenCalled();
  });

  it('respects enabled=false', () => {
    const handler = vi.fn();
    renderHook(
      () => useHotkey('Mod+K', handler, { enabled: false }),
      { wrapper: withPlatform(macPlatform) },
    );

    fireKey('k', { metaKey: true });
    expect(handler).not.toHaveBeenCalled();
  });

  it('higher priority wins when specs collide', () => {
    const lowHandler = vi.fn();
    const highHandler = vi.fn();
    renderHook(() => useHotkey('Mod+K', lowHandler, { priority: 0 }), {
      wrapper: withPlatform(macPlatform),
    });
    renderHook(() => useHotkey('Mod+K', highHandler, { priority: 10 }), {
      wrapper: withPlatform(macPlatform),
    });

    fireKey('k', { metaKey: true });
    expect(highHandler).toHaveBeenCalledTimes(1);
    expect(lowHandler).not.toHaveBeenCalled();
  });

  it('calls preventDefault by default', () => {
    const handler = vi.fn();
    renderHook(() => useHotkey('Mod+K', handler), {
      wrapper: withPlatform(macPlatform),
    });

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe('useHotkeys', () => {
  beforeEach(() => {
    __resetHotkeyRegistry();
  });

  afterEach(() => {
    __resetHotkeyRegistry();
  });

  it('registers multiple shortcuts', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    const bindings = [
      { spec: 'Mod+K', handler: h1 },
      { spec: 'Mod+J', handler: h2 },
    ];
    renderHook(() => useHotkeys(bindings), {
      wrapper: withPlatform(macPlatform),
    });

    fireKey('k', { metaKey: true });
    fireKey('j', { metaKey: true });

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it('skips disabled bindings', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    const bindings = [
      { spec: 'Mod+K', handler: h1, enabled: false },
      { spec: 'Mod+J', handler: h2 },
    ];
    renderHook(() => useHotkeys(bindings), {
      wrapper: withPlatform(macPlatform),
    });

    fireKey('k', { metaKey: true });
    fireKey('j', { metaKey: true });

    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledTimes(1);
  });
});
