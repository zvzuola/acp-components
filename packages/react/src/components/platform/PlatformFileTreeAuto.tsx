import { useEffect } from 'react';
import {
  acpStore,
  fileTreeStore,
  loadFileTree,
  refreshFileTree,
  refreshNode,
} from '@acp-components/core';
import { usePlatform } from '../../context/PlatformContext';

/**
 * Mount-once wrapper that drives the per-workspace file tree from the host
 * `Platform`.
 *
 * Renders nothing. On mount it:
 *  1. Registers `platform.readDirectory` as the directory reader for each
 *     workspace and auto-loads its root tree when the workspace appears.
 *  2. Tears down file-tree state when a workspace is removed.
 *  3. Subscribes to `platform.watchFileTree` (when provided) and forwards
 *     directory / workspace change events to the file-tree actions.
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
  const { readDirectory, watchFileTree } = platform;

  // Register reader + auto-load on workspace add; clean up on workspace remove.
  useEffect(() => {
    const knownCwds = new Set<string>();

    const seed = (cwd: string) => {
      knownCwds.add(cwd);
      fileTreeStore.getState().initWorkspace(cwd, readDirectory);
      loadFileTree(cwd).catch(() => {
        /* surfaced via fileTreeStore error state */
      });
    };

    // Replay workspaces that already exist at setup time. Zustand's subscribe
    // does not emit the current state on subscribe, and React runs descendant
    // effects before ancestor effects — so a workspace added by a child (e.g.
    // AcpProvider's defaultCwd effect, or one pre-populated in the store before
    // this component mounts) would be missed without this synchronous seed pass.
    for (const [cwd] of acpStore.getState().workspaces) {
      if (!knownCwds.has(cwd)) seed(cwd);
    }

    const unsubscribe = acpStore.subscribe((state) => {
      for (const [cwd] of state.workspaces) {
        if (!knownCwds.has(cwd)) seed(cwd);
      }
      for (const cwd of knownCwds) {
        if (!state.workspaces.has(cwd)) {
          knownCwds.delete(cwd);
          fileTreeStore.getState().removeWorkspace(cwd);
        }
      }
    });

    return () => {
      unsubscribe();
      for (const cwd of knownCwds) {
        fileTreeStore.getState().removeWorkspace(cwd);
      }
    };
  }, [readDirectory]);

  // Wire up the host file-tree watcher, if the platform provides one.
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

    const result = watchFileTree(callbacks);
    return () => {
      if (typeof result === 'function') result();
    };
  }, [watchFileTree]);

  return null;
}
