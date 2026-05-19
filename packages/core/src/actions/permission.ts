import type { SessionId } from '@agentclientprotocol/sdk';
import { sessionStore } from '../store/sessionStore';

export function respondToPermission(sessionId: SessionId, optionId: string): void {
  const reqs = sessionStore.getState().sessions.get(sessionId)?.pendingPermissions ?? [];
  const req = reqs[0];
  if (req) {
    req.resolve(optionId);
    sessionStore.getState().removePermissionRequest(sessionId, req.id);
  }
}

export function denyPermission(sessionId: SessionId): void {
  const reqs = sessionStore.getState().sessions.get(sessionId)?.pendingPermissions ?? [];
  const req = reqs[0];
  if (req) {
    req.reject();
    sessionStore.getState().removePermissionRequest(sessionId, req.id);
  }
}
