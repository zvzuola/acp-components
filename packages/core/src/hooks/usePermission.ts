import { useCallback } from 'react';
import { useSession } from './useSession';
import { useSessionStore } from '../store/sessionStore';
import type { SessionId } from '@agentclientprotocol/sdk';

export function usePermission(sessionId: SessionId | null) {
  const { pendingPermissions } = useSession(sessionId);
  const removePermissionRequest = useSessionStore((s) => s.removePermissionRequest);

  const respond = useCallback((sessionId: SessionId, optionId: string) => {
    const reqs = useSessionStore.getState().sessions.get(sessionId)?.pendingPermissions ?? [];
    const req = reqs[0];
    if (req) {
      req.resolve(optionId);
      removePermissionRequest(sessionId);
    }
  }, [removePermissionRequest]);

  const deny = useCallback((sessionId: SessionId) => {
    const reqs = useSessionStore.getState().sessions.get(sessionId)?.pendingPermissions ?? [];
    const req = reqs[0];
    if (req) {
      req.reject();
      removePermissionRequest(sessionId);
    }
  }, [removePermissionRequest]);

  return {
    pendingPermissions,
    currentRequest: pendingPermissions[0] ?? null,
    respond,
    deny,
  };
}
