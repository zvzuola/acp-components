import { useCallback } from 'react';
import { useSession } from './useSession';
import { respondToPermission, denyPermission } from '@acp-components/core';
import type { SessionId } from '@acp-components/core';

export function usePermission(sessionId: SessionId | null) {
  const { pendingPermissions } = useSession(sessionId);

  const respond = useCallback((sid: SessionId, optionId: string) => {
    respondToPermission(sid, optionId);
  }, []);

  const deny = useCallback((sid: SessionId) => {
    denyPermission(sid);
  }, []);

  return {
    pendingPermissions,
    currentRequest: pendingPermissions[0] ?? null,
    respond,
    deny,
  };
}
