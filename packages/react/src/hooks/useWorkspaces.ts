import { useShallow } from 'zustand/react/shallow';
import { useCallback } from 'react';
import { useAcpStore } from './useAcpStore';
import { acpStore, findWorkspaceBySession } from '@acp-components/core';

/**
 * React access point for workspace state — the single hook through which UI
 * components read the workspace list and invoke add/remove.
 *
 * Workspace **runtime state** (the `workspaces` Map, and its invariants with
 * sessions/agents — e.g. `removeWorkspace` clears the active session,
 * `removeAgent` prunes that agent's sessions from every workspace) lives in
 * `acpStore` (core). Workspace **persistence** (load/save to
 * `platform.storage('workspaces')`) lives in `PlatformWorkspacesAuto`
 * (Platform layer). This hook is only the React-facing read/operate entry; it
 * deliberately carries no native capability and is therefore orthogonal to
 * `usePlatform()` and `AcpContext` (agent connection state).
 */
export function useWorkspaces() {
  const workspaces = useAcpStore(
    useShallow((s) => Array.from(s.workspaces.values())),
  );

  const addWorkspace = useCallback((cwd: string) => {
    acpStore.getState().addWorkspace(cwd);
  }, []);

  const removeWorkspace = useCallback((cwd: string) => {
    acpStore.getState().removeWorkspace(cwd);
  }, []);

  // Derive the workspace cwd holding the global active session (null if none).
  const activeWorkspaceCwd = useAcpStore(
    useShallow((s) => {
      if (!s.activeSessionId) return null;
      return findWorkspaceBySession(s.workspaces, s.activeSessionId);
    }),
  );

  return { workspaces, addWorkspace, removeWorkspace, activeWorkspaceCwd };
}
