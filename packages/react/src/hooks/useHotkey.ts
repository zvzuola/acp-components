import { useCallback, useEffect, useRef } from 'react';
import { useContext } from 'react';
import { PlatformContext } from '../context/PlatformContext';
import {
  parseShortcut,
  matchShortcut,
  type ParsedShortcut,
} from '@acp-components/core';
import type { PlatformOS } from '@acp-components/core';

// ---------------------------------------------------------------------------
// Module-level shortcut registry.
//
// A single `document`-level `keydown` listener dispatches to all registered
// shortcuts, so N `useHotkey` calls produce 1 listener, not N. Entries are
// ordered by descending priority; the first match wins and subsequent
// entries are skipped (stop-on-first-match dispatch).
// ---------------------------------------------------------------------------

interface RegistryEntry {
  id: number;
  parsed: ParsedShortcut;
  os: PlatformOS;
  handler: (e: KeyboardEvent) => void;
  options: ResolvedHotkeyOptions;
}

interface ResolvedHotkeyOptions {
  enabled: boolean;
  allowInInput: boolean;
  preventDefault: boolean;
  priority: number;
}

const registry: RegistryEntry[] = [];
let nextId = 1;
let listenerAttached = false;

const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isInputTarget(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  if (!target) return false;
  if (INPUT_TAGS.has(target.tagName)) return true;
  return target.isContentEditable;
}

function dispatchKeyDown(e: KeyboardEvent): void {
  // Iterate a snapshot so handlers can mutate the registry (unregister)
  // without invalidating the loop.
  const snapshot = registry.slice();
  for (const entry of snapshot) {
    if (!entry.options.enabled) continue;
    if (!entry.options.allowInInput && isInputTarget(e)) continue;
    if (!matchShortcut(e, entry.parsed, entry.os)) continue;
    if (entry.options.preventDefault) e.preventDefault();
    entry.handler(e);
    return; // first match wins
  }
}

function ensureListener(): void {
  if (listenerAttached || typeof document === 'undefined') return;
  document.addEventListener('keydown', dispatchKeyDown, true);
  listenerAttached = true;
}

function maybeRemoveListener(): void {
  if (!listenerAttached) return;
  if (registry.length > 0) return;
  document.removeEventListener('keydown', dispatchKeyDown, true);
  listenerAttached = false;
}

function register(
  spec: string,
  handler: (e: KeyboardEvent) => void,
  os: PlatformOS,
  options: ResolvedHotkeyOptions,
): () => void {
  const id = nextId++;
  const parsed = parseShortcut(spec);
  const entry: RegistryEntry = { id, parsed, os, handler, options };
  // Insert maintaining descending-priority order (stable for equal priority).
  let inserted = false;
  for (let i = 0; i < registry.length; i++) {
    if (registry[i].options.priority < options.priority) {
      registry.splice(i, 0, entry);
      inserted = true;
      break;
    }
  }
  if (!inserted) registry.push(entry);
  ensureListener();

  return () => {
    const idx = registry.findIndex((e2) => e2.id === id);
    if (idx !== -1) registry.splice(idx, 1);
    maybeRemoveListener();
  };
}

// ---------------------------------------------------------------------------
// Public hook API
// ---------------------------------------------------------------------------

export interface UseHotkeyOptions {
  /** Disable the shortcut (e.g. when a modal captures keys). Default true. */
  enabled?: boolean;
  /** Fire even when focus is in input/textarea/contenteditable. Default false. */
  allowInInput?: boolean;
  /** Call preventDefault on match. Default true. */
  preventDefault?: boolean;
  /** Higher priority wins when specs collide. Default 0. */
  priority?: number;
}

function resolveOptions(options?: UseHotkeyOptions): ResolvedHotkeyOptions {
  return {
    enabled: options?.enabled ?? true,
    allowInInput: options?.allowInInput ?? false,
    preventDefault: options?.preventDefault ?? true,
    priority: options?.priority ?? 0,
  };
}

/**
 * Register a single global keyboard shortcut. The spec uses the shared
 * grammar ("Mod+K", "Mod+Shift+P", "Enter"). "Mod" resolves to Meta on macOS,
 * Ctrl elsewhere, based on `Platform.os`.
 *
 * The shortcut is active only while the calling component is mounted. The
 * handler is stored in a ref so identity changes between renders do not
 * re-register the shortcut (preventing flaky unmount/re-mount cycles).
 */
export function useHotkey(
  spec: string,
  handler: (e: KeyboardEvent) => void,
  options?: UseHotkeyOptions,
): void {
  const platform = useContext(PlatformContext);
  const os = platform?.os;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  // Stable wrapper so the handler identity in the registry never changes.
  const stableHandler = useCallback((e: KeyboardEvent) => {
    handlerRef.current(e);
  }, []);

  const resolved = resolveOptions(options);
  // Re-register when spec, os, or any option changes. Handler identity
  // is intentionally excluded (ref-stabilized above).
  const depsKey = `${spec}::${os ?? 'undefined'}::${resolved.enabled}::${resolved.allowInInput}::${resolved.preventDefault}::${resolved.priority}`;

  useEffect(() => {
    if (!resolved.enabled) return;
    return register(spec, stableHandler, os, resolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey]);
}

export interface HotkeyBinding extends UseHotkeyOptions {
  spec: string;
  handler: (e: KeyboardEvent) => void;
}

/**
 * Register multiple shortcuts at once. Each binding is independent. Pass a
 * stable array reference (or memoize) to avoid re-registering on every render.
 */
export function useHotkeys(bindings: HotkeyBinding[]): void {
  const platform = useContext(PlatformContext);
  const os = platform?.os;

  // Serialize bindings into a dependency key so the effect only re-runs when
  // the actual binding content changes, not when the array identity changes.
  const depsKey = bindings
    .map((b) => {
      const o = resolveOptions(b);
      return `${b.spec}::${o.enabled}::${o.allowInInput}::${o.preventDefault}::${o.priority}`;
    })
    .join('||');

  useEffect(() => {
    const unregisters: Array<() => void> = [];
    for (const b of bindings) {
      const o = resolveOptions(b);
      if (!o.enabled) continue;
      // Store handler in a closure-captured ref-like pattern: we pass the
      // handler directly; callers should memoize bindings to keep handlers
      // stable, matching the rest of the codebase's hook conventions.
      unregisters.push(register(b.spec, b.handler, os, o));
    }
    return () => {
      for (const fn of unregisters) fn();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey, os]);
}

// Exposed for tests: reset the registry between test files.
// Not part of the public API.
export function __resetHotkeyRegistry(): void {
  registry.length = 0;
  if (listenerAttached && typeof document !== 'undefined') {
    document.removeEventListener('keydown', dispatchKeyDown, true);
    listenerAttached = false;
  }
}
