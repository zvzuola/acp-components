import { useEffect, useMemo, useRef } from 'react';
import { acpStore } from '@acp-components/core';
import type { PlatformStorage } from '@acp-components/core';
import { usePlatform } from '../../context/PlatformContext';
import { useAcpStore } from '../../hooks/useAcpStore';

// Key under which the workspace path list is persisted inside
// `platform.storage('workspaces')`. Identical across every host — the load/save
// logic only ever touches the storage slice, never host-native APIs, so web
// and desktop (and any future host) follow exactly the same code path.
const STORAGE_KEY = 'workspaces';

/**
 * Mount-once wrapper that persists the workspace list via `platform.storage`.
 *
 * Renders nothing. On mount it loads the cached workspace paths and replays
 * them into the store; thereafter it saves whenever the workspace set changes
 * (debounced by a key-set diff so identical writes are skipped).
 *
 * Mounted by default inside `<PlatformProvider>` (its `autoWorkspaces` prop); it
 * reads the platform via `usePlatform()`. Like `PlatformFileTreeAuto` it does
 * NOT depend on `<AcpProvider>` — it talks to the module-level `acpStore`
 * directly (`addWorkspace` / `workspaces`) — so it may sit above or below
 * `AcpProvider`, and runs before it (ancestor effects fire first), which is
 * exactly what we want: cached workspaces are restored before any agent UI
 * mounts.
 *
 * Workspace load/save used to live on the `Platform` interface
 * (`loadWorkspaces` / `saveWorkspaces`); it has been pulled out so the
 * interface stays a generic host-capability contract. Both hosts back `storage`
 * with localStorage (the web demo directly, Tauri via its webview), so a single
 * storage-backed implementation suffices — and because the helpers only call
 * the storage slice, the logic is identical on every host (no per-platform
 * branches, no direct `localStorage` access).
 *
 * Hosts that want full control over workspace persistence may set
 * `autoWorkspaces={false}` on `PlatformProvider` (or omit this component) and
 * call `loadWorkspaces` / `saveWorkspaces` themselves.
 */
export function PlatformWorkspacesAuto() {
  const { storage } = usePlatform();
  const workspaces = useAcpStore((s) => s.workspaces);

  // Stable ref to the storage instance for the logical name. Memoized on the
  // `storage` function identity (a stable method on the Platform object) so the
  // load effect runs only once on mount. Without this memo, hosts whose
  // `storage()` returns a fresh object each call (e.g. `createWebPlatform`)
  // would retrigger the load effect every render — re-hydrating from storage
  // and racing the save effect, which can resurrect a workspace the user just
  // removed (load reads stale storage before save flushes the deletion).
  const workspacesStorage = useMemo(() => storage('workspaces'), [storage]);

  const initialized = useRef(false);
  const lastSavedKeys = useRef<string>('');

  // Load cached workspaces on first mount.
  useEffect(() => {
    let cancelled = false;
    loadWorkspaces(workspacesStorage)
      .then((paths) => {
        if (cancelled) return;
        // addWorkspace is idempotent (see acpStore), so replaying cached paths
        // is safe even if some are already present.
        for (const cwd of paths) acpStore.getState().addWorkspace(cwd);
        lastSavedKeys.current = JSON.stringify(paths.slice().sort());
      })
      .catch((e) => {
        if (cancelled) return;
        console.error('[workspaces] Failed to load cached workspaces:', e);
        lastSavedKeys.current = '[]';
      })
      .finally(() => {
        if (!cancelled) initialized.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [workspacesStorage]);

  // Persist workspace changes after initialization (debounced by key-set diff).
  useEffect(() => {
    if (!initialized.current) return;
    const keys = JSON.stringify(Array.from(workspaces.keys()).sort());
    if (keys === lastSavedKeys.current) return;
    lastSavedKeys.current = keys;
    saveWorkspaces(workspacesStorage, Array.from(workspaces.keys())).catch((e) => {
      console.error('[workspaces] Failed to save workspaces:', e);
    });
  }, [workspacesStorage, workspaces]);

  return null;
}

/**
 * Load the persisted workspace list.
 *
 * Host-agnostic by construction: only `storage.getItem` is touched, so web and
 * desktop (and any future host) run the exact same logic. A corrupt or
 * non-array payload yields `[]` rather than throwing — a fresh start is always
 * preferable to crashing the app on a bad cache.
 */
export async function loadWorkspaces(storage: PlatformStorage): Promise<string[]> {
  const raw = await storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    // Corrupt cache — treat as empty so the app starts cleanly.
    return [];
  }
}

/** Persist the workspace list. */
export async function saveWorkspaces(
  storage: PlatformStorage,
  paths: string[],
): Promise<void> {
  await storage.setItem(STORAGE_KEY, JSON.stringify(paths));
}
