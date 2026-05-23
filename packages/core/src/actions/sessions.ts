import type { SessionId } from '@agentclientprotocol/sdk';
import type { AcpClient } from '../client/AcpClient';
import { acpStore } from '../store/acpStore';
import { sessionStore } from '../store/sessionStore';
import type { SessionMeta } from '../types';

export async function createSession(client: AcpClient, agentId: string, cwd: string): Promise<SessionId> {
  const res = await client.newSession(cwd);
  const meta: SessionMeta = { id: res.sessionId, cwd, agentId, loaded: true };
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
  acpStore.getState().updateSession(sessionId, { loaded: true });
}

export async function selectSession(client: AcpClient, sessionId: SessionId): Promise<void> {
  const acp = acpStore.getState();
  const cwd = acp.activeWorkspaceCwd;
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
  } catch {
    if (prev) {
      sessionStore.getState().setConfigOptions(sessionId, prev);
    }
  }
}
