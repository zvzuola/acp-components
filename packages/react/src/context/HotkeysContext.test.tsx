import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import {
  HotkeysProvider,
  useActions,
  useHotkeysContext,
  __resetActionRegistry,
  type ActionBinding,
} from './HotkeysContext';
import { __resetHotkeyRegistry } from '../hooks/useHotkey';
import { PlatformContext } from './PlatformContext';
import type { Platform, MenuAction } from './PlatformContext';

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

const macPlatform: Platform = {
  platform: 'desktop',
  os: 'macos',
  storage: (() => ({})) as any,
};

function withProvider(platform: Platform | null) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      PlatformContext.Provider,
      { value: platform },
      React.createElement(HotkeysProvider, null, children),
    );
}

describe('useActions (option passthrough)', () => {
  beforeEach(() => {
    __resetActionRegistry();
    __resetHotkeyRegistry();
  });

  afterEach(() => {
    __resetActionRegistry();
    __resetHotkeyRegistry();
  });

  it('does not fire handler when enabled is false', () => {
    const handler = vi.fn();
    const bindings: ActionBinding[] = [
      { id: 'save', shortcut: 'Mod+S', handler, enabled: false },
    ];
    renderHook(() => useActions(bindings), {
      wrapper: withProvider(macPlatform),
    });

    fireKey('s', { metaKey: true });
    expect(handler).not.toHaveBeenCalled();
  });

  it('passes allowInInput through to the hotkey listener', () => {
    const handler = vi.fn();
    const bindings: ActionBinding[] = [
      { id: 'save', shortcut: 'Mod+S', handler, allowInInput: true },
    ];
    renderHook(() => useActions(bindings), {
      wrapper: withProvider(macPlatform),
    });

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent('keydown', {
      key: 's',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
    document.body.removeChild(input);
  });

  it('passes preventDefault: false through to the hotkey listener', () => {
    const handler = vi.fn();
    const bindings: ActionBinding[] = [
      { id: 'save', shortcut: 'Mod+S', handler, preventDefault: false },
    ];
    renderHook(() => useActions(bindings), {
      wrapper: withProvider(macPlatform),
    });

    const event = new KeyboardEvent('keydown', {
      key: 's',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
  });

  it('higher priority wins when specs collide', () => {
    const lowHandler = vi.fn();
    const highHandler = vi.fn();
    renderHook(
      () =>
        useActions([
          { id: 'low', shortcut: 'Mod+K', handler: lowHandler, priority: 0 },
        ]),
      { wrapper: withProvider(macPlatform) },
    );
    renderHook(
      () =>
        useActions([
          { id: 'high', shortcut: 'Mod+K', handler: highHandler, priority: 10 },
        ]),
      { wrapper: withProvider(macPlatform) },
    );

    fireKey('k', { metaKey: true });
    expect(highHandler).toHaveBeenCalledTimes(1);
    expect(lowHandler).not.toHaveBeenCalled();
  });
});

describe('dispatch', () => {
  beforeEach(() => {
    __resetActionRegistry();
    __resetHotkeyRegistry();
  });

  afterEach(() => {
    __resetActionRegistry();
    __resetHotkeyRegistry();
  });

  it('fires the handler for a registered action id and returns true', async () => {
    const handler = vi.fn();
    const bindings: ActionBinding[] = [
      { id: 'save', shortcut: 'Mod+S', handler },
    ];
    const { result } = renderHook(
      () => {
        useActions(bindings);
        return useHotkeysContext();
      },
      { wrapper: withProvider(macPlatform) },
    );

    await waitFor(() => {
      expect(result.current.dispatch('save')).toBe(true);
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('returns false for an unknown action id', async () => {
    const handler = vi.fn();
    const bindings: ActionBinding[] = [
      { id: 'save', shortcut: 'Mod+S', handler },
    ];
    const { result } = renderHook(
      () => {
        useActions(bindings);
        return useHotkeysContext();
      },
      { wrapper: withProvider(macPlatform) },
    );

    expect(result.current.dispatch('nope')).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns false and does not fire the handler when enabled is false', async () => {
    const handler = vi.fn();
    const bindings: ActionBinding[] = [
      { id: 'save', shortcut: 'Mod+S', handler, enabled: false },
    ];
    const { result } = renderHook(
      () => {
        useActions(bindings);
        return useHotkeysContext();
      },
      { wrapper: withProvider(macPlatform) },
    );

    // Wait for the action to be registered before asserting dispatch behavior.
    await waitFor(() => {
      expect(result.current.actions.length).toBeGreaterThan(0);
    });

    expect(result.current.dispatch('save')).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('useActions native menu integration', () => {
  beforeEach(() => {
    __resetActionRegistry();
    __resetHotkeyRegistry();
  });

  afterEach(() => {
    __resetActionRegistry();
    __resetHotkeyRegistry();
  });

  it('passes enabled to platform.menu.setActions for submenu actions', async () => {
    const setActions = vi.fn();
    const onAction = vi.fn(() => () => {});
    const platformWithMenu: Platform = {
      ...macPlatform,
      menu: { setActions, onAction },
    };
    const handler = vi.fn();
    const bindings: ActionBinding[] = [
      {
        id: 'save',
        shortcut: 'Mod+S',
        handler,
        label: 'Save',
        submenu: 'File',
        enabled: false,
      },
    ];
    renderHook(() => useActions(bindings), {
      wrapper: withProvider(platformWithMenu),
    });

    await waitFor(() => {
      expect(setActions).toHaveBeenCalled();
    });
    const menuActions = setActions.mock.calls[0][0] as MenuAction[];
    expect(menuActions[0].enabled).toBe(false);
  });

  it('registers submenu actions via useHotkey even when platform.menu exists (fallback)', () => {
    const setActions = vi.fn();
    const onAction = vi.fn(() => () => {});
    const platformWithMenu: Platform = {
      ...macPlatform,
      menu: { setActions, onAction },
    };
    const handler = vi.fn();
    const bindings: ActionBinding[] = [
      {
        id: 'save',
        shortcut: 'Mod+S',
        handler,
        label: 'Save',
        submenu: 'File',
      },
    ];
    renderHook(() => useActions(bindings), {
      wrapper: withProvider(platformWithMenu),
    });

    // The webview keydown listener should fire even though the action has a
    // submenu and platform.menu exists — this is the fallback path.
    fireKey('s', { metaKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// User shortcut overrides: setShortcut / resetShortcut / resetAllShortcuts.
//
// The webview keydown listener resolves `override ?? default` live, so a
// rebound shortcut fires on the NEW combo and the old one stops firing.
// Storage is exercised through a synchronous in-memory store.
// ---------------------------------------------------------------------------

/** A synchronous in-memory settings store for override persistence tests. */
function memStore() {
  const data = new Map<string, string>();
  return {
    getItemSync: vi.fn((key: string) => data.get(key) ?? null),
    getItem: vi.fn((key: string) => Promise.resolve(data.get(key) ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
      return Promise.resolve();
    }),
  };
}

function platformWithStore(store: ReturnType<typeof memStore>): Platform {
  return { ...macPlatform, storage: (() => store) as any };
}

describe('shortcut overrides', () => {
  beforeEach(() => {
    __resetActionRegistry();
    __resetHotkeyRegistry();
  });
  afterEach(() => {
    __resetActionRegistry();
    __resetHotkeyRegistry();
  });

  it('fires the new combo after setShortcut and stops firing the old one', async () => {
    const store = memStore();
    const platform = platformWithStore(store);
    const handler = vi.fn();
    const bindings: ActionBinding[] = [
      { id: 'save', shortcut: 'Mod+S', handler },
    ];
    const { result } = renderHook(
      () => {
        useActions(bindings);
        return useHotkeysContext();
      },
      { wrapper: withProvider(platform) },
    );

    // Default: Mod+S fires, Mod+G does not.
    fireKey('s', { metaKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
    fireKey('g', { metaKey: true });
    expect(handler).toHaveBeenCalledTimes(1);

    // Rebind to Mod+G.
    act(() => result.current.setShortcut('save', 'Mod+G'));

    // New combo fires; old combo no longer does.
    fireKey('g', { metaKey: true });
    expect(handler).toHaveBeenCalledTimes(2);
    fireKey('s', { metaKey: true });
    expect(handler).toHaveBeenCalledTimes(2);

    // Override persisted to storage.
    expect(store.setItem).toHaveBeenCalledWith(
      'acp-shortcut-overrides',
      JSON.stringify({ save: 'Mod+G' }),
    );
  });

  it('resetShortcut reverts to the default combo', async () => {
    const store = memStore();
    const platform = platformWithStore(store);
    const handler = vi.fn();
    const bindings: ActionBinding[] = [
      { id: 'save', shortcut: 'Mod+S', handler },
    ];
    const { result } = renderHook(
      () => {
        useActions(bindings);
        return useHotkeysContext();
      },
      { wrapper: withProvider(platform) },
    );

    act(() => result.current.setShortcut('save', 'Mod+G'));
    fireKey('s', { metaKey: true });
    expect(handler).not.toHaveBeenCalled();
    fireKey('g', { metaKey: true });
    expect(handler).toHaveBeenCalledTimes(1);

    act(() => result.current.resetShortcut('save'));
    // Default restored: Mod+S fires again, Mod+G does not.
    fireKey('s', { metaKey: true });
    expect(handler).toHaveBeenCalledTimes(2);
    fireKey('g', { metaKey: true });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('resetAllShortcuts clears every override', async () => {
    const store = memStore();
    const platform = platformWithStore(store);
    const h1 = vi.fn();
    const h2 = vi.fn();
    const { result } = renderHook(
      () => {
        useActions([
          { id: 'a', shortcut: 'Mod+A', handler: h1 },
          { id: 'b', shortcut: 'Mod+B', handler: h2 },
        ]);
        return useHotkeysContext();
      },
      { wrapper: withProvider(platform) },
    );

    act(() => {
      result.current.setShortcut('a', 'Mod+X');
      result.current.setShortcut('b', 'Mod+Y');
    });

    act(() => result.current.resetAllShortcuts());

    // Defaults active again.
    fireKey('a', { metaKey: true });
    expect(h1).toHaveBeenCalledTimes(1);
    fireKey('b', { metaKey: true });
    expect(h2).toHaveBeenCalledTimes(1);
    fireKey('x', { metaKey: true });
    expect(h1).toHaveBeenCalledTimes(1);
    fireKey('y', { metaKey: true });
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it('loads persisted overrides from storage on mount', async () => {
    const store = memStore();
    store.getItemSync.mockReturnValue(
      JSON.stringify({ save: 'Mod+G' }),
    );
    const platform = platformWithStore(store);
    const handler = vi.fn();
    const bindings: ActionBinding[] = [
      { id: 'save', shortcut: 'Mod+S', handler },
    ];
    renderHook(() => useActions(bindings), {
      wrapper: withProvider(platform),
    });

    // Overridden combo fires; default does not.
    fireKey('g', { metaKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
    fireKey('s', { metaKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
