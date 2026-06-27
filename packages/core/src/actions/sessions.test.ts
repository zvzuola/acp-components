import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createSession,
  forkSession,
  loadSession,
  selectSession,
  closeSession,
  deleteSession,
  refreshSessions,
  loadMoreSessions,
  setSessionConfigOption,
} from './sessions';
import { acpStore } from '../store/acpStore';
import { sessionStore } from '../store/sessionStore';
import type {
  NewSessionResponse,
  LoadSessionResponse,
  ListSessionsResponse,
  SetSessionConfigOptionResponse,
  ForkSessionResponse,
  SessionInfo,
  SessionConfigOption,
} from '@agentclientprotocol/sdk';

/**
 * Minimal fake AcpClient implementing only the methods `sessions.ts` calls.
 * Each method is a vi.fn so tests can assert call args + preset responses.
 */
function makeFakeClient(overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}) {
  return {
    newSession: vi.fn(),
    forkSession: vi.fn(),
    loadSession: vi.fn(),
    closeSession: vi.fn(),
    deleteSession: vi.fn(),
    listSessions: vi.fn(),
    setSessionConfigOption: vi.fn(),
    ...overrides,
  };
}

function resetStores(): void {
  acpStore.setState({
    agents: new Map(),
    workspaces: new Map(),
    activeSessionId: null,
    pendingAuth: null,
  });
  sessionStore.setState({ sessions: new Map() });
}

const CWD = '/proj';
const AGENT = 'agent-1';

beforeEach(() => {
  resetStores();
});

describe('createSession', () => {
  it('creates the session meta + store entry and applies configOptions', async () => {
    acpStore.getState().addWorkspace(CWD);
    const configOptions: SessionConfigOption[] = [
      { id: 'model', type: 'select', name: 'Model', options: [] } as unknown as SessionConfigOption,
    ];
    const res: NewSessionResponse = { sessionId: 's1', configOptions };
    const client = makeFakeClient({ newSession: vi.fn().mockResolvedValue(res) });

    const id = await createSession(client as never, AGENT, CWD);

    expect(id).toBe('s1');
    expect(client.newSession).toHaveBeenCalledWith(CWD);
    const acp = acpStore.getState();
    expect(acp.workspaces.get(CWD)!.sessions.get('s1')!).toMatchObject({ id: 's1', cwd: CWD, agentId: AGENT, loaded: true });
    const sess = sessionStore.getState().sessions.get('s1')!;
    expect(sess).toBeDefined();
    expect(sess.configOptions).toBe(configOptions);
  });

  it('works when configOptions is absent', async () => {
    acpStore.getState().addWorkspace(CWD);
    const res: NewSessionResponse = { sessionId: 's2', configOptions: null };
    const client = makeFakeClient({ newSession: vi.fn().mockResolvedValue(res) });
    await createSession(client as never, AGENT, CWD);
    expect(sessionStore.getState().sessions.get('s2')!.configOptions).toEqual([]);
  });
});

describe('forkSession', () => {
  it('throws when the source session is not in any workspace', async () => {
    const client = makeFakeClient();
    await expect(forkSession(client as never, 'missing')).rejects.toThrow(/not found in any workspace/);
  });

  it('reuses the source session’s agentId and cwd', async () => {
    acpStore.getState().addWorkspace(CWD);
    acpStore.getState().addSession({ id: 'src', cwd: CWD, agentId: AGENT, loaded: true });
    const res: ForkSessionResponse = { sessionId: 'fork-1' };
    const client = makeFakeClient({ forkSession: vi.fn().mockResolvedValue(res) });

    const id = await forkSession(client as never, 'src');

    expect(id).toBe('fork-1');
    expect(client.forkSession).toHaveBeenCalledWith('src', CWD);
    const forked = acpStore.getState().workspaces.get(CWD)!.sessions.get('fork-1')!;
    expect(forked).toMatchObject({ id: 'fork-1', cwd: CWD, agentId: AGENT, loaded: true });
  });
});

describe('loadSession', () => {
  it('resets the session store entry and applies configOptions + marks loaded', async () => {
    acpStore.getState().addWorkspace(CWD);
    acpStore.getState().addSession({ id: 's1', cwd: CWD, agentId: AGENT, loaded: false });
    sessionStore.getState().ensureSession('s1');
    sessionStore.getState().addMessage('s1', { id: 'm', role: 'user', parts: [], timestamp: 0 });

    const configOptions: SessionConfigOption[] = [];
    const res: LoadSessionResponse = { configOptions };
    const client = makeFakeClient({ loadSession: vi.fn().mockResolvedValue(res) });

    await loadSession(client as never, 's1', CWD);

    // The action calls the client with positional args; AcpClient wraps them
    // into the SDK request object internally.
    expect(client.loadSession).toHaveBeenCalledWith('s1', CWD);
    expect(sessionStore.getState().sessions.get('s1')!.messages).toEqual([]);
    expect(acpStore.getState().workspaces.get(CWD)!.sessions.get('s1')!.loaded).toBe(true);
  });
});

describe('selectSession', () => {
  beforeEach(() => {
    acpStore.getState().addWorkspace(CWD);
    acpStore.getState().addSession({ id: 's1', cwd: CWD, agentId: AGENT, loaded: true });
  });

  it('only sets active when the session is already loaded (no load call)', async () => {
    const client = makeFakeClient({ loadSession: vi.fn() });
    await selectSession(client as never, 's1');
    expect(acpStore.getState().activeSessionId).toBe('s1');
    expect(client.loadSession).not.toHaveBeenCalled();
  });

  it('loads the session when not yet loaded', async () => {
    acpStore.getState().updateSession('s1', { loaded: false });
    const client = makeFakeClient({
      loadSession: vi.fn().mockResolvedValue({ configOptions: null } as LoadSessionResponse),
    });
    await selectSession(client as never, 's1');
    expect(acpStore.getState().activeSessionId).toBe('s1');
    expect(client.loadSession).toHaveBeenCalled();
    expect(acpStore.getState().workspaces.get(CWD)!.sessions.get('s1')!.loaded).toBe(true);
  });

  it('is a no-op when the session is not in any workspace', async () => {
    const client = makeFakeClient({ loadSession: vi.fn() });
    await selectSession(client as never, 'missing');
    expect(acpStore.getState().activeSessionId).toBeNull();
    expect(client.loadSession).not.toHaveBeenCalled();
  });

  it('swallows loadSession failures (agent may not support it)', async () => {
    acpStore.getState().updateSession('s1', { loaded: false });
    const client = makeFakeClient({ loadSession: vi.fn().mockRejectedValue(new Error('nope')) });
    await selectSession(client as never, 's1');
    // Still became active.
    expect(acpStore.getState().activeSessionId).toBe('s1');
  });
});

describe('closeSession / deleteSession', () => {
  beforeEach(() => {
    acpStore.getState().addWorkspace(CWD);
    acpStore.getState().addSession({ id: 's1', cwd: CWD, agentId: AGENT, loaded: true });
    sessionStore.getState().ensureSession('s1');
  });

  it('closeSession calls the agent and removes from both stores', async () => {
    const client = makeFakeClient({ closeSession: vi.fn().mockResolvedValue({}) });
    await closeSession(client as never, 's1');
    expect(client.closeSession).toHaveBeenCalledWith('s1');
    expect(acpStore.getState().workspaces.get(CWD)!.sessions.has('s1')).toBe(false);
    expect(sessionStore.getState().sessions.has('s1')).toBe(false);
  });

  it('deleteSession calls the agent and removes from both stores', async () => {
    const client = makeFakeClient({ deleteSession: vi.fn().mockResolvedValue({}) });
    await deleteSession(client as never, 's1');
    expect(client.deleteSession).toHaveBeenCalledWith('s1');
    expect(acpStore.getState().workspaces.get(CWD)!.sessions.has('s1')).toBe(false);
    expect(sessionStore.getState().sessions.has('s1')).toBe(false);
  });
});

describe('refreshSessions / loadMoreSessions', () => {
  beforeEach(() => {
    acpStore.getState().addWorkspace(CWD);
    acpStore.getState().addAgent({ id: AGENT, name: AGENT, status: 'connected', agentInfo: null, capabilities: null, authMethods: [] });
  });

  it('refreshSessions replaces that agent’s sessions and stores a next cursor', async () => {
    const sessions: SessionInfo[] = [{ sessionId: 's1', cwd: CWD, title: null, updatedAt: null }];
    const res: ListSessionsResponse = { sessions, nextCursor: 'cursor-1' };
    const client = makeFakeClient({ listSessions: vi.fn().mockResolvedValue(res) });

    await refreshSessions(client as never, AGENT, CWD);

    expect(client.listSessions).toHaveBeenCalledWith(undefined, CWD);
    const ws = acpStore.getState().workspaces.get(CWD)!;
    expect([...ws.sessions.keys()]).toEqual(['s1']);
    expect(ws.sessionListCursors.get(AGENT)).toBe('cursor-1');
  });

  it('loadMoreSessions appends sessions and advances / clears the cursor', async () => {
    const res1: ListSessionsResponse = { sessions: [{ sessionId: 's1', cwd: CWD, title: null, updatedAt: null }], nextCursor: 'cursor-2' };
    const res2: ListSessionsResponse = { sessions: [{ sessionId: 's2', cwd: CWD, title: null, updatedAt: null }], nextCursor: null };
    const client = makeFakeClient({
      listSessions: vi.fn().mockResolvedValueOnce(res1).mockResolvedValueOnce(res2),
    });

    await loadMoreSessions(client as never, AGENT, CWD, 'cursor-1');
    expect(client.listSessions).toHaveBeenLastCalledWith('cursor-1', CWD);
    expect([...acpStore.getState().workspaces.get(CWD)!.sessions.keys()]).toEqual(['s1']);

    await loadMoreSessions(client as never, AGENT, CWD, 'cursor-2');
    expect([...acpStore.getState().workspaces.get(CWD)!.sessions.keys()]).toEqual(['s1', 's2']);
    expect(acpStore.getState().workspaces.get(CWD)!.sessionListCursors.has(AGENT)).toBe(false);
  });
});

describe('setSessionConfigOption', () => {
  beforeEach(() => {
    sessionStore.getState().ensureSession('s1');
  });

  it('applies the returned configOptions on success', async () => {
    const next: SessionConfigOption[] = [
      { id: 'model', type: 'select', name: 'Model', options: [] } as unknown as SessionConfigOption,
    ];
    const client = makeFakeClient({
      setSessionConfigOption: vi.fn().mockResolvedValue({ configOptions: next } as SetSessionConfigOptionResponse),
    });
    await setSessionConfigOption(client as never, 's1', 'model', 'gpt-4');
    expect(sessionStore.getState().sessions.get('s1')!.configOptions).toBe(next);
  });

  it('rolls back to the previous configOptions on failure', async () => {
    const prev: SessionConfigOption[] = [
      { id: 'model', type: 'select', name: 'Model', options: [] } as unknown as SessionConfigOption,
    ];
    sessionStore.getState().setConfigOptions('s1', prev);
    const client = makeFakeClient({
      setSessionConfigOption: vi.fn().mockRejectedValue(new Error('rejected')),
    });
    await setSessionConfigOption(client as never, 's1', 'model', 'bad');
    expect(sessionStore.getState().sessions.get('s1')!.configOptions).toBe(prev);
  });
});
