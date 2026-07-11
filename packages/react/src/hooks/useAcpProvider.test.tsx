import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Fake provider — spies on the lifecycle methods so we can assert what the hook
// does (and does NOT) call across mount/unmount cycles. Kept module-level so the
// "singleton pinned by providerRef" contract is exercised faithfully: the hook
// must reuse a single provider instance and never destroy it on unmount.
// ---------------------------------------------------------------------------
function makeFakeProvider() {
  const listeners = new Set<() => void>();
  const readyListeners = new Set<() => void>();
  let _ready = false;
  return {
    ready: false,
    _setReady(v: boolean) {
      _ready = v;
      // @ts-expect-error readonly mirror — tests flip ready to simulate connect
      this.ready = v;
      for (const fn of readyListeners) fn();
    },
    subscribe: vi.fn((fn: () => void) => {
      readyListeners.add(fn);
      return () => readyListeners.delete(fn);
    }),
    destroy: vi.fn(() => {
      listeners.clear();
      readyListeners.clear();
    }),
    getClient: vi.fn((agentId: string) => ({ id: agentId, __fake: true })),
    addAgent: vi.fn(async () => {}),
    removeAgent: vi.fn(async () => {}),
  };
}

const fakeProvider = makeFakeProvider();

// Mock `createAcpProvider` to return our singleton fake; pass through `acpStore`
// (the hook reads it via `useShallow`) and the types the hook imports.
vi.mock('@acp-components/core', async (importActual) => {
  const actual = await importActual<typeof import('@acp-components/core')>();
  return {
    ...actual,
    createAcpProvider: vi.fn(() => fakeProvider),
  };
});

// `useAcpProvider` reads `usePlatform().process?.createStdioTransport`. Provide
// a stub Platform via the real PlatformContext so the hook doesn't crash.
vi.mock('../context/PlatformContext', () => ({
  usePlatform: () => ({ process: { createStdioTransport: () => ({}) } }),
}));

// Import AFTER the mocks are registered.
import { useAcpProvider } from './useAcpProvider';
import { acpStore } from '@acp-components/core';

function resetAcpStore() {
  acpStore.setState({
    agents: new Map(),
    workspaces: new Map(),
    activeSessionId: null,
    pendingAuth: null,
  });
}

beforeEach(() => {
  resetAcpStore();
  fakeProvider.destroy.mockClear();
  fakeProvider.subscribe.mockClear();
  fakeProvider.getClient.mockClear();
  fakeProvider.addAgent.mockClear();
  fakeProvider.removeAgent.mockClear();
  // @ts-expect-error readonly mirror — reset ready for the next test
  fakeProvider.ready = false;
});

describe('useAcpProvider — singleton lifecycle (StrictMode-safe)', () => {
  it('does NOT destroy the provider on unmount', () => {
    const { unmount } = renderHook(() => useAcpProvider({ agents: [] }));
    // Subscribed once on mount.
    expect(fakeProvider.subscribe).toHaveBeenCalledTimes(1);
    unmount();
    // The bug being fixed: cleanup must NOT call destroy (that would tear down
    // every agent connection and, since the ref isn't cleared, leave a dead
    // provider on the StrictMode remount).
    expect(fakeProvider.destroy).not.toHaveBeenCalled();
  });

  it('survives a mount→unmount→remount cycle without destroying or recreating the provider', () => {
    const { unmount } = renderHook(() => useAcpProvider({ agents: [] }));
    unmount();

    // Remount (mirrors React 18 StrictMode's mount→unmount→mount in dev).
    const result2 = renderHook(() => useAcpProvider({ agents: [] }));
    // Provider was never destroyed across the cycle, and not recreated either.
    expect(fakeProvider.destroy).not.toHaveBeenCalled();
    // `getClient` still returns the live (non-destroyed) instance after remount.
    expect(result2.result.current.getClient('any')).toEqual({ id: 'any', __fake: true });
    result2.unmount();
    expect(fakeProvider.destroy).not.toHaveBeenCalled();
  });

  it('exposes ready=true once the provider reports it', () => {
    const { result } = renderHook(() => useAcpProvider({ agents: [] }));
    expect(result.current.isReady).toBe(false);
    act(() => fakeProvider._setReady(true));
    expect(result.current.isReady).toBe(true);
  });
});
