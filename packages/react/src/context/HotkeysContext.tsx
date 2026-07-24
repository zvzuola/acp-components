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
}

const HotkeysContext = createContext<HotkeysContextValue>({
  actions: [],
  format: (s) => s,
  dispatch: () => false,
});

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
  const menuActions = useMemo(
    () => actions.filter((a) => a.submenu && a.label),
    [actions],
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
    () => ({ actions, format, dispatch }),
    [actions, format, dispatch],
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
  // Register into the shared action registry (for menu + discovery).
  useEffect(() => {
    return registerActions(bindings);
  }, [bindings]);

  // ALL actions are dispatched via the webview keydown listener. On desktop
  // hosts with a native menu, the OS intercepts the accelerator before the
  // webview sees the keydown, so the menu event fires instead. When the
  // native menu is unavailable or not yet built, this listener is the sole
  // dispatch path — a reliable fallback.
  const hotkeyBindings: HotkeyBinding[] = useMemo(() => {
    return bindings.map((b) => ({
      spec: b.shortcut,
      handler: b.handler,
      enabled: b.enabled,
      allowInInput: b.allowInInput,
      preventDefault: b.preventDefault,
      priority: b.priority,
    }));
  }, [bindings]);

  useHotkeys(hotkeyBindings);
}

// Exposed for tests.
export function __resetActionRegistry(): void {
  actionRegistry.length = 0;
  listeners.clear();
}
