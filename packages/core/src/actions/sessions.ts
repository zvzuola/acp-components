import type { SessionId, SessionConfigOption } from '@agentclientprotocol/sdk';
import type { AcpClient } from '../client/AcpClient';
import { acpStore, findWorkspaceBySession } from '../store/acpStore';
import { sessionStore } from '../store/sessionStore';
import type { SessionMeta } from '../types';

/**
 * Cache the most recently observed `configOptions` on the owning agent so
 * UI surfaces without a sessionId yet (e.g. NewSessionView) can render
 * model/mode selectors. No-op if the agent is unknown or the payload empty.
 */
function cacheAgentConfigOptions(agentId: string, configOptions: SessionConfigOption[] | null | undefined): void {
  if (!configOptions) return;
  acpStore.getState().updateAgent(agentId, { configOptions });
}

/** Look up the agentId owning a given session (across all workspaces). */
function agentIdForSession(sessionId: SessionId): string | undefined {
  const { workspaces } = acpStore.getState();
  const cwd = findWorkspaceBySession(workspaces, sessionId);
  if (!cwd) return undefined;
  return workspaces.get(cwd)?.sessions.get(sessionId)?.agentId;
}

export async function createSession(client: AcpClient, agentId: string, cwd: string): Promise<SessionId> {
  const res = await client.newSession(cwd);
  const meta: SessionMeta = { id: res.sessionId, cwd, agentId, loaded: true };
  acpStore.getState().addSession(meta);
  sessionStore.getState().ensureSession(res.sessionId);
  if (res.configOptions) {
    sessionStore.getState().setConfigOptions(res.sessionId, res.configOptions);
  }
  cacheAgentConfigOptions(agentId, res.configOptions);
  return res.sessionId;
}

export async function forkSession(client: AcpClient, sourceSessionId: SessionId): Promise<SessionId> {
  const cwd = findWorkspaceBySession(acpStore.getState().workspaces, sourceSessionId);
  if (!cwd) throw new Error(`Source session ${sourceSessionId} not found in any workspace`);

  const ws = acpStore.getState().workspaces.get(cwd);
  const sourceMeta = ws?.sessions.get(sourceSessionId);
  if (!sourceMeta) throw new Error(`Source session ${sourceSessionId} not found`);

  const res = await client.forkSession(sourceSessionId, cwd);
  const meta: SessionMeta = { id: res.sessionId, cwd, agentId: sourceMeta.agentId, loaded: true };
  acpStore.getState().addSession(meta);
  sessionStore.getState().ensureSession(res.sessionId);
  if (res.configOptions) {
    sessionStore.getState().setConfigOptions(res.sessionId, res.configOptions);
  }
  return res.sessionId;
}

export async function loadSession(client: AcpClient, sessionId: SessionId, cwd: string): Promise<void> {
  sessionStore.getState().resetSession(sessionId);
  const res = await client.loadSession(sessionId, cwd);
  if (res.configOptions) {
    sessionStore.getState().setConfigOptions(sessionId, res.configOptions);
  }
  const agentId = agentIdForSession(sessionId);
  if (agentId) cacheAgentConfigOptions(agentId, res.configOptions);
  acpStore.getState().updateSession(sessionId, { loaded: true });
}

export async function selectSession(client: AcpClient, sessionId: SessionId): Promise<void> {
  const acp = acpStore.getState();
  const cwd = findWorkspaceBySession(acp.workspaces, sessionId);
  if (!cwd) return;
  const ws = acp.workspaces.get(cwd);
  const meta = ws?.sessions.get(sessionId);
  if (!meta) return;
  acpStore.getState().setActiveSession(sessionId);
  if (meta.loaded) return;
  try {
    await loadSession(client, sessionId, meta.cwd);
  } catch {
    // loadSession optional — agent may not support it
  }
}

export async function closeSession(client: AcpClient, sessionId: SessionId): Promise<void> {
  await client.closeSession(sessionId);
  acpStore.getState().removeSession(sessionId);
  sessionStore.getState().removeSession(sessionId);
}

export async function deleteSession(client: AcpClient, sessionId: SessionId): Promise<void> {
  await client.deleteSession(sessionId);
  acpStore.getState().removeSession(sessionId);
  sessionStore.getState().removeSession(sessionId);
}

export async function refreshSessions(client: AcpClient, agentId: string, cwd: string): Promise<void> {
  const res = await client.listSessions(undefined, cwd);
  acpStore.getState().setSessions(res.sessions, agentId, cwd);
  if (res.nextCursor) {
    acpStore.getState().appendSessions([], agentId, cwd, res.nextCursor);
  }
}

export async function loadMoreSessions(client: AcpClient, agentId: string, cwd: string, cursor: string): Promise<void> {
  const res = await client.listSessions(cursor, cwd);
  acpStore.getState().appendSessions(res.sessions, agentId, cwd, res.nextCursor ?? null);
}

export async function setSessionConfigOption(
  client: AcpClient,
  sessionId: SessionId,
  configId: string,
  value: string | boolean,
): Promise<void> {
  const prev = sessionStore.getState().sessions.get(sessionId)?.configOptions;
  try {
    const res = await client.setSessionConfigOption(sessionId, configId, value);
    sessionStore.getState().setConfigOptions(sessionId, res.configOptions);
    const agentId = agentIdForSession(sessionId);
    if (agentId) cacheAgentConfigOptions(agentId, res.configOptions);
  } catch {
    if (prev) {
      sessionStore.getState().setConfigOptions(sessionId, prev);
    }
  }
}

export async function authenticate(client: AcpClient, methodId: string): Promise<void> {
  await client.authenticate(methodId);
  acpStore.getState().clearAuthRequired();
}

export async function authenticateWithEnv(
  client: AcpClient,
  agentId: string,
  methodId: string,
  envVars: Record<string, string>,
): Promise<void> {
  const initRes = await client.reconnectWithEnv(envVars);
  acpStore.getState().updateAgent(agentId, {
    status: 'connected',
    agentInfo: client.agentInfo,
    capabilities: client.capabilities,
    authMethods: initRes.authMethods ?? [],
  });
  await client.authenticate(methodId);
  acpStore.getState().clearAuthRequired();
}
