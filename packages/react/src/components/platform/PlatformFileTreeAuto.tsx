import { useEffect } from 'react';
import {
  acpStore,
  fileTreeStore,
  loadFileTree,
  refreshFileTree,
  refreshNode,
} from '@acp-components/core';
import { usePlatform } from '../../context/PlatformContext';

type AcpStoreState = ReturnType<typeof acpStore.getState>;

/**
 * Derive the cwd of the workspace that contains the active session, or `null`
 * when there is no active session (or it belongs to a workspace that no longer
 * exists). Extracted as a pure selector so it can be shared between the seed
 * pass and the subscription callback.
 */
function selectActiveCwd(state: AcpStoreState): string | null {
  if (!state.activeSessionId) return null;
  for (const [cwd, ws] of state.workspaces) {
    if (ws.sessions.has(state.activeSessionId)) return cwd;
  }
  return null;
}

/**
 * Mount-once wrapper that drives the per-workspace file tree from the host
 * `Platform.fs`.
 *
 * Renders nothing. On mount it:
 *  1. Registers `platform.fs.readDirectory` as the directory reader for each
 *     workspace (cheap — no I/O) so trees can be loaded on demand.
 *  2. Auto-loads the root tree **only for the active workspace** (the one
 *     holding the current `activeSessionId`). Other workspaces are NOT
 *     pre-loaded — they load lazily when first viewed (see `FileTreeView`),
 *     avoiding eager directory reads for every workspace on startup.
 *  3. When the active workspace changes, loads the newly-active workspace's
 *     tree (its previous tree state, if any, is retained so expanded
 *     directories are preserved when the user returns).
 *  4. Tears down file-tree state when a workspace is removed.
 *  5. Subscribes to `platform.fs.watchFileTree` (when provided) **only for the
 *     active workspace**, swapping the subscription as the active workspace
 *     changes, and forwards directory / workspace change events to the
 *     file-tree actions.
 *
 * Mounted by default inside `<PlatformProvider>` (its `autoFileTree` prop); it
 * reads the platform via `usePlatform()`, so any location beneath the provider
 * works. It does NOT depend on `<AcpProvider>` — it talks to the module-level
 * `acpStore` directly — so it may sit above or below `AcpProvider`. Components
 * read tree state via `useFileTree`.
 *
 * Hosts that want full control over file-tree setup (custom reader, their own
 * watcher wiring) may set `autoFileTree={false}` on `PlatformProvider` (or omit
 * this component) and call the file-tree actions themselves.
 */
export function PlatformFileTreeAuto() {
  const platform = usePlatform();
  const fs = platform.fs;
  const readDirectory = fs?.readDirectory;
  const watchFileTree = fs?.watchFileTree;

  // Register reader for every workspace; auto-load ONLY the active workspace.
  // No-op when the host provides no `fs` slice (or no `readDirectory`).
  useEffect(() => {
    if (!readDirectory) return;
    const knownCwds = new Set<string>();

    // Register the directory reader for a workspace without triggering a load.
    const register = (cwd: string) => {
      knownCwds.add(cwd);
      fileTreeStore.getState().initWorkspace(cwd, readDirectory);
    };

    // Load a workspace's root tree if it is not already loaded. Safe to call
    // repeatedly — `loadFileTree` re-reads the root, which also serves as a
    // refresh; we guard with a `loaded` check to avoid redundant work.
    const ensureLoaded = (cwd: string) => {
      const ws = fileTreeStore.getState().workspaces.get(cwd);
      if (ws && (ws.loading || (ws.rootNodes.length > 0 && !ws.error))) return;
      loadFileTree(cwd).catch(() => {
        /* surfaced via fileTreeStore error state */
      });
    };

    // Replay workspaces that already exist at setup time. Zustand's subscribe
    // does not emit the current state on subscribe, and React runs descendant
    // effects before ancestor effects — so a workspace added by a child (e.g.
    // AcpProvider's defaultCwd effect, or one pre-populated in the store before
    // this component mounts) would be missed without this synchronous pass.
    const initialState = acpStore.getState();
    for (const [cwd] of initialState.workspaces) {
      if (!knownCwds.has(cwd)) register(cwd);
    }
    const initialActiveCwd = selectActiveCwd(initialState);
    if (initialActiveCwd) ensureLoaded(initialActiveCwd);

    // Track the last active cwd so we only load on actual change. Initialized
    // from the seeded state; the subscription callback compares against it.
    let lastActiveCwd = initialActiveCwd;

    const unsubscribe = acpStore.subscribe((state) => {
      // Register readers for newly-appeared workspaces.
      for (const [cwd] of state.workspaces) {
        if (!knownCwds.has(cwd)) register(cwd);
      }
      // Tear down readers for removed workspaces.
      for (const cwd of knownCwds) {
        if (!state.workspaces.has(cwd)) {
          knownCwds.delete(cwd);
          fileTreeStore.getState().removeWorkspace(cwd);
        }
      }
      // Load the active workspace's tree (only) whenever it changes.
      const activeCwd = selectActiveCwd(state);
      if (activeCwd && activeCwd !== lastActiveCwd) {
        ensureLoaded(activeCwd);
      }
      lastActiveCwd = activeCwd;
    });

    return () => {
      unsubscribe();
      for (const cwd of knownCwds) {
        fileTreeStore.getState().removeWorkspace(cwd);
      }
    };
  }, [readDirectory]);

  // Wire up the host file-tree watcher, if the platform provides one. Only the
  // active workspace is watched — when the active workspace changes we
  // unsubscribe the old one and subscribe the new one, so background workspaces
  // do not each open a watcher connection.
  useEffect(() => {
    if (!watchFileTree) return;

    const callbacks = {
      onDirectoryChanged: (cwd: string, dirPath: string) => {
        refreshNode(cwd, dirPath).catch(() => {});
      },
      onWorkspaceChanged: (cwd: string) => {
        refreshFileTree(cwd).catch(() => {});
      },
    };

    const watcher = watchFileTree(callbacks);

    // A host that does not support watching returns `void` — nothing to wire.
    if (!watcher) return;

    // Track which cwd is currently subscribed so we can swap on change.
    let current: string | null = null;
    const sync = (next: string | null) => {
      if (next === current) return;
      if (current) watcher.unsubscribe(current);
      current = next;
      if (current) watcher.subscribe(current);
    };

    // Seed from the state already present at setup (subscribe doesn't emit the
    // current state, and descendant effects run before this ancestor effect).
    sync(selectActiveCwd(acpStore.getState()));

    const unsubscribeStore = acpStore.subscribe((state) => {
      sync(selectActiveCwd(state));
    });

    return () => {
      unsubscribeStore();
      if (current) watcher.unsubscribe(current);
      current = null;
      watcher.dispose();
    };
  }, [watchFileTree]);

  return null;
}
