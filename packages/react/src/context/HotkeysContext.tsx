import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePlatform, type MenuAction } from '../context/PlatformContext';
import { useHotkeys, type HotkeyBinding, type UseHotkeyOptions } from '../hooks/useHotkey';
import { formatShortcut } from '@acp-components/core';

// ---------------------------------------------------------------------------
// Action registry context.
//
// Provides a single source of truth for application-level keyboard shortcuts
// that also appear in the native menu bar (on desktop hosts). Actions are
// registered declaratively via `useActions`, which routes ALL of them through
// the webview `useHotkey` keydown listener. On desktop hosts with a native
// menu, actions that have a `submenu` are also registered in the native menu
// (via `platform.menu.setActions`) for display/discoverability. The OS
// intercepts the menu accelerator before the webview, so only one path fires.
// When the native menu is unavailable (web, or not yet built), the webview
// listener is the sole dispatch path — a reliable fallback.
// ---------------------------------------------------------------------------

export interface ActionBinding extends UseHotkeyOptions {
  /** Stable unique id, e.g. 'new-session'. */
  id: string;
  /** Shortcut spec, e.g. 'Mod+N'. */
  shortcut: string;
  /** Handler called when the shortcut fires (menu or webview). */
  handler: () => void;
  /** Display label for the menu item. */
  label?: string;
  /** Submenu path. When set, this action appears in the native menu. */
  submenu?: string;
  /** Insert a separator before this item in the menu. */
  separatorBefore?: boolean;
}

interface HotkeysContextValue {
  /** All currently registered actions (for a shortcuts help dialog). */
  actions: ReadonlyArray<ActionBinding>;
  /** Format a shortcut spec for display using the current OS. */
  format: (spec: string) => string;
  /** Programmatically trigger a registered action by id. Returns false if not found or disabled. */
  dispatch: (actionId: string) => boolean;
  /** All user shortcut overrides (actionId -> spec), persisted. */
  overrides: Readonly<Record<string, string>>;
  /** Resolved spec for an action: override ?? defaultSpec. */
  getShortcut: (actionId: string, defaultSpec: string) => string;
  /** Set / replace a user override. An empty spec clears it. */
  setShortcut: (actionId: string, spec: string) => void;
  /** Remove a single override, reverting to the registered default. */
  resetShortcut: (actionId: string) => void;
  /** Remove every override. */
  resetAllShortcuts: () => void;
}

const HotkeysContext = createContext<HotkeysContextValue>({
  actions: [],
  format: (s) => s,
  dispatch: () => false,
  overrides: {},
  getShortcut: (_id, spec) => spec,
  setShortcut: () => { },
  resetShortcut: () => { },
  resetAllShortcuts: () => { },
});

// ---------------------------------------------------------------------------
// User shortcut overrides (persisted).
//
// Maps actionId -> user-customized spec. Only entries that differ from the
// registered default are stored, so shipping a new default in a later version
// automatically supersedes a stale override. Loaded from
// platform.storage('settings') at provider mount (sync when the host offers
// getItemSync, else async), written back on every change.
// ---------------------------------------------------------------------------

const OVERRIDES_STORAGE_KEY = 'acp-shortcut-overrides';

/** Parse a persisted overrides blob, dropping non-string / empty entries. */
function parseOverrides(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v.length > 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function useHotkeysContext(): HotkeysContextValue {
  return useContext(HotkeysContext);
}

// ---------------------------------------------------------------------------
// Internal: a global registry that the context layer reads from.
// Components call `useActions(bindings)` which adds/removes entries;
// the context provider periodically (on mount/state change) snapshots
// them for the `actions` array and the native menu.
// ---------------------------------------------------------------------------

interface RegistryAction {
  binding: ActionBinding;
  seq: number;
}

const actionRegistry: RegistryAction[] = [];
let actionSeq = 0;
const listeners = new Set<() => void>();

function registerActions(bindings: ActionBinding[]): () => void {
  const added: RegistryAction[] = bindings.map((b) => ({
    binding: b,
    seq: actionSeq++,
  }));
  actionRegistry.push(...added);
  for (const fn of listeners) fn();

  return () => {
    for (const a of added) {
      const idx = actionRegistry.indexOf(a);
      if (idx !== -1) actionRegistry.splice(idx, 1);
    }
    for (const fn of listeners) fn();
  };
}

function snapshotActions(): ActionBinding[] {
  return actionRegistry
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map((a) => a.binding);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface HotkeysProviderProps {
  children: ReactNode;
}

/**
 * Provides the action registry and native-menu integration. Mount once near
 * the top of the tree (inside `PlatformProvider`). When `platform.menu` is
 * present, it registers menu actions and subscribes to menu-activation events.
*/
export function HotkeysProvider({ children }: HotkeysProviderProps) {
  const platform = usePlatform();
  const [actions, setActions] = useState<ActionBinding[]>(() => snapshotActions());

  // --- User shortcut overrides (persisted to platform.storage('settings')) ---
  // Only entries that differ from the registered default are stored. The
  // initial state prefers a sync read (when the host offers getItemSync) so
  // the first render already reflects saved overrides; hosts without it (web
  // localStorage) get an async load below.
  const [overrides, setOverrides] = useState<Record<string, string>>(() => {
    try {
      const store = platform.storage('settings');
      if (typeof store.getItemSync === 'function') {
        return parseOverrides(store.getItemSync(OVERRIDES_STORAGE_KEY));
      }
    } catch {
      // ignore storage failures - operate with no overrides
    }
    return {};
  });

  // Async load for hosts without getItemSync (the web/localStorage path).
  useEffect(() => {
    const store = (() => {
      try {
        return platform.storage('settings');
      } catch {
        return null;
      }
    })();
    if (!store) return;
    if (typeof store.getItemSync === 'function') return;
    if (typeof store.getItem !== 'function') return;
    let cancelled = false;
    store
      .getItem(OVERRIDES_STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        const next = parseOverrides(raw);
        if (Object.keys(next).length > 0) setOverrides(next);
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, [platform]);

  const persistOverrides = useCallback(
    (next: Record<string, string>) => {
      try {
        const store = platform.storage('settings');
        if (typeof store.setItem === 'function') {
          store.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(next)).catch(() => { });
        }
      } catch {
        // ignore storage failures - in-memory overrides still work this session
      }
    },
    [platform],
  );

  const setShortcut = useCallback(
    (actionId: string, spec: string) => {
      const trimmed = spec.trim();
      setOverrides((prev) => {
        const next = { ...prev };
        if (trimmed) next[actionId] = trimmed;
        else delete next[actionId];
        persistOverrides(next);
        return next;
      });
    },
    [persistOverrides],
  );

  const resetShortcut = useCallback(
    (actionId: string) => {
      setOverrides((prev) => {
        if (!(actionId in prev)) return prev;
        const next = { ...prev };
        delete next[actionId];
        persistOverrides(next);
        return next;
      });
    },
    [persistOverrides],
  );

  const resetAllShortcuts = useCallback(() => {
    setOverrides((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      persistOverrides({});
      return {};
    });
  }, [persistOverrides]);

  const getShortcut = useCallback(
    (actionId: string, defaultSpec: string) => overrides[actionId] ?? defaultSpec,
    [overrides],
  );

  // Subscribe to registry changes so the `actions` snapshot stays current.
  useEffect(() => {
    const update = () => setActions(snapshotActions());
    listeners.add(update);
    // Capture actions registered before this effect ran. In React, child
    // effects fire before parent effects, so `useActions` registrations may
    // have already populated the registry by the time we subscribe here.
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);

  // --- Native menu integration ---
  // Apply overrides when building menu items so the native menu accelerator
  // matches the user's customized binding (defaults live in the registry).
  const menuActions = useMemo(
    () =>
      actions
        .filter((a) => a.submenu && a.label)
        .map((a) => ({ ...a, shortcut: overrides[a.id] ?? a.shortcut })),
    [actions, overrides],
  );
  // Register menu items with the host. Re-register whenever the menu action
  // set changes.
  useEffect(() => {
    if (!platform.menu || menuActions.length === 0) return;
    const menuItems: MenuAction[] = menuActions.map((a) => ({
      id: a.id,
      label: a.label!,
      shortcut: a.shortcut,
      submenu: a.submenu,
      separatorBefore: a.separatorBefore,
      enabled: a.enabled,
    }));
    platform.menu.setActions(menuItems);
  }, [platform.menu, menuActions]);

  // Subscribe to menu activations and route to handlers.
  const handlersRef = useRef<Map<string, () => void>>(new Map());
  handlersRef.current = useMemo(() => {
    const m = new Map<string, () => void>();
    for (const a of actions) m.set(a.id, a.handler);
    return m;
  }, [actions]);

  useEffect(() => {
    if (!platform.menu) return;
    const off = platform.menu.onAction((actionId) => {
      handlersRef.current.get(actionId)?.();
    });
    return off;
  }, [platform.menu]);

  // Programmatically trigger a registered action by id. Respects `enabled`.
  const dispatch = useCallback((actionId: string) => {
    const action = actions.find((a) => a.id === actionId);
    if (!action || action.enabled === false) return false;
    action.handler();
    return true;
  }, [actions]);

  const format = useCallback(
    (spec: string) => formatShortcut(spec, platform.os),
    [platform.os],
  );

  const value = useMemo<HotkeysContextValue>(
    () => ({
      actions,
      format,
      dispatch,
      overrides,
      getShortcut,
      setShortcut,
      resetShortcut,
      resetAllShortcuts,
    }),
    [actions, format, dispatch, overrides, getShortcut, setShortcut, resetShortcut, resetAllShortcuts],
  );

  return (
    <HotkeysContext.Provider value={value}>
      {children}
    </HotkeysContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer hook: `useActions`
// ---------------------------------------------------------------------------

/**
 * Register application-level actions. ALL actions are routed through the
 * webview `useHotkey` keydown listener. Actions with a `submenu` are also
 * registered in the native menu (when `platform.menu` exists) for display;
 * on desktop the OS intercepts the accelerator before the webview, so only
 * one path fires.
 *
 * Pass a stable (memoized) array to avoid re-registering on every render.
 */
export function useActions(bindings: ActionBinding[]): void {
  const { overrides } = useHotkeysContext();

  // Register into the shared action registry (for menu + discovery).
  // The registry stores the DEFAULT spec; overrides are applied at the two
  // consumption points (the webview listener below + the native menu in the
  // provider) so defaults stay pristine for the shortcuts panel's reset.
  // Depend on a serialized content key (not array identity): `useActions`
  // now subscribes to context for overrides, so it re-renders when the
  // provider's action snapshot updates; an inline `bindings` array would
  // otherwise change identity every render and re-register forever.
  const registryKey = bindings
    .map((b) => `${b.id}::${b.shortcut}::${b.label ?? ''}::${b.submenu ?? ''}`)
    .join('||');
  useEffect(() => {
    return registerActions(bindings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registryKey]);

  // ALL actions are dispatched via the webview keydown listener. On desktop
  // hosts with a native menu, the OS intercepts the accelerator before the
  // webview sees the keydown, so the menu event fires instead. When the
  // native menu is unavailable or not yet built, this listener is the sole
  // dispatch path — a reliable fallback.
  const hotkeyBindings: HotkeyBinding[] = useMemo(() => {
    return bindings.map((b) => ({
      spec: overrides[b.id] ?? b.shortcut,
      handler: b.handler,
      enabled: b.enabled,
      allowInInput: b.allowInInput,
      preventDefault: b.preventDefault,
      priority: b.priority,
    }));
  }, [bindings, overrides]);

  useHotkeys(hotkeyBindings);
}

// Exposed for tests.
export function __resetActionRegistry(): void {
  actionRegistry.length = 0;
  listeners.clear();
}
