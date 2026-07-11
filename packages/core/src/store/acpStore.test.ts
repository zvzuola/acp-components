import { describe, it, expect, beforeEach } from 'vitest';
import { acpStore, findWorkspaceBySession } from './acpStore';
import { sessionStore } from './sessionStore';
import type { AgentConnection, SessionMeta } from '../types';
import type { SessionInfo } from '@agentclientprotocol/sdk';

/** Merge-mode reset: clears state fields but preserves store actions. */
function resetStore(): void {
  acpStore.setState({
    agents: new Map(),
    workspaces: new Map(),
    activeSessionId: null,
    pendingAuth: null,
  });
  // removeAgent now cascades into sessionStore (drops orphaned message
  // caches), so keep the two stores in sync across tests to avoid leakage.
  sessionStore.setState({ sessions: new Map() });
}

function makeAgent(id: string): AgentConnection {
  return { id, name: id, status: 'connecting', agentInfo: null, capabilities: null, authMethods: [] };
}

function makeMeta(id: string, cwd: string, agentId: string): SessionMeta {
  return { id, cwd, agentId, loaded: false };
}

function makeSessionInfo(id: string, cwd: string): SessionInfo {
  return { sessionId: id, cwd, title: null, updatedAt: null };
}

beforeEach(() => {
  resetStore();
});

describe('findWorkspaceBySession', () => {
  it('returns the cwd that owns the session', () => {
    acpStore.getState().addWorkspace('/a');
    acpStore.getState().addSession(makeMeta('s1', '/a', 'agent-1'));
    expect(findWorkspaceBySession(acpStore.getState().workspaces, 's1')).toBe('/a');
  });

  it('returns null when no workspace owns the session', () => {
    acpStore.getState().addWorkspace('/a');
    expect(findWorkspaceBySession(acpStore.getState().workspaces, 'missing')).toBeNull();
  });
});

describe('acpStore — workspaces', () => {
  it('addWorkspace is idempotent', () => {
    acpStore.getState().addWorkspace('/a');
    acpStore.getState().addWorkspace('/a');
    expect([...acpStore.getState().workspaces.keys()]).toEqual(['/a']);
  });

  it('removeWorkspace clears the active session if it belonged to that workspace', () => {
    acpStore.getState().addWorkspace('/a');
    acpStore.getState().addSession(makeMeta('s1', '/a', 'agent-1'));
    acpStore.getState().setActiveSession('s1');
    expect(acpStore.getState().activeSessionId).toBe('s1');

    acpStore.getState().removeWorkspace('/a');
    expect(acpStore.getState().activeSessionId).toBeNull();
    expect(acpStore.getState().workspaces.has('/a')).toBe(false);
  });

  it('removeWorkspace leaves active session untouched if it belonged elsewhere', () => {
    acpStore.getState().addWorkspace('/a');
    acpStore.getState().addWorkspace('/b');
    acpStore.getState().addSession(makeMeta('s1', '/b', 'agent-1'));
    acpStore.getState().setActiveSession('s1');
    acpStore.getState().removeWorkspace('/a');
    expect(acpStore.getState().activeSessionId).toBe('s1');
  });
});

describe('acpStore — agents', () => {
  it('addAgent / updateAgent mutate the agents map', () => {
    acpStore.getState().addAgent(makeAgent('a1'));
    acpStore.getState().updateAgent('a1', { status: 'connected', agentInfo: { name: 'A1', version: '1.0' } });
    const a = acpStore.getState().agents.get('a1')!;
    expect(a.status).toBe('connected');
    expect(a.agentInfo?.name).toBe('A1');
  });

  it('updateAgent is a no-op for unknown agent', () => {
    const before = acpStore.getState();
    acpStore.getState().updateAgent('nope', { status: 'error' });
    expect(acpStore.getState()).toBe(before);
  });

  it('removeAgent cascades: drops that agent’s sessions in every workspace and clears active if removed', () => {
    acpStore.getState().addWorkspace('/a');
    acpStore.getState().addAgent(makeAgent('a1'));
    acpStore.getState().addAgent(makeAgent('a2'));
    acpStore.getState().addSession(makeMeta('s-a1', '/a', 'a1'));
    acpStore.getState().addSession(makeMeta('s-a2', '/a', 'a2'));
    acpStore.getState().setActiveSession('s-a1');

    acpStore.getState().removeAgent('a1');

    expect(acpStore.getState().agents.has('a1')).toBe(false);
    const ws = acpStore.getState().workspaces.get('/a')!;
    expect([...ws.sessions.keys()]).toEqual(['s-a2']);
    // active session belonged to the removed agent → cleared.
    expect(acpStore.getState().activeSessionId).toBeNull();
  });

  it('removeAgent keeps active session if it belonged to a different agent', () => {
    acpStore.getState().addWorkspace('/a');
    acpStore.getState().addAgent(makeAgent('a1'));
    acpStore.getState().addAgent(makeAgent('a2'));
    acpStore.getState().addSession(makeMeta('s-a2', '/a', 'a2'));
    acpStore.getState().setActiveSession('s-a2');
    acpStore.getState().removeAgent('a1');
    expect(acpStore.getState().activeSessionId).toBe('s-a2');
  });

  it('removeAgent drops the orphaned sessions’ message cache from sessionStore', () => {
    acpStore.getState().addWorkspace('/a');
    acpStore.getState().addAgent(makeAgent('a1'));
    acpStore.getState().addAgent(makeAgent('a2'));
    acpStore.getState().addSession(makeMeta('s-a1', '/a', 'a1'));
    acpStore.getState().addSession(makeMeta('s-a2', '/a', 'a2'));
    // Seed message caches for both sessions (ensureSession creates the entry).
    sessionStore.getState().ensureSession('s-a1');
    sessionStore.getState().ensureSession('s-a2');
    expect(sessionStore.getState().sessions.has('s-a1')).toBe(true);
    expect(sessionStore.getState().sessions.has('s-a2')).toBe(true);

    acpStore.getState().removeAgent('a1');

    // The removed agent’s session cache is gone; the other agent’s survives.
    expect(sessionStore.getState().sessions.has('s-a1')).toBe(false);
    expect(sessionStore.getState().sessions.has('s-a2')).toBe(true);
  });
});

describe('acpStore — session list sync', () => {
  beforeEach(() => {
    acpStore.getState().addWorkspace('/a');
    acpStore.getState().addAgent(makeAgent('a1'));
  });

  it('setSessions replaces that agent’s sessions in the workspace and resets its cursor', () => {
    acpStore.getState().appendSessions([], 'a1', '/a', 'cursor-1');
    acpStore.getState().setSessions([makeSessionInfo('s1', '/a'), makeSessionInfo('s2', '/a')], 'a1', '/a');
    const ws = acpStore.getState().workspaces.get('/a')!;
    expect([...ws.sessions.keys()]).toEqual(['s1', 's2']);
    expect(ws.sessionListCursors.has('a1')).toBe(false);
    expect(ws.sessions.get('s1')!.agentId).toBe('a1');
  });

  it('setSessions only touches the targeted agent, leaving other agents’ sessions intact', () => {
    acpStore.getState().addAgent(makeAgent('a2'));
    acpStore.getState().addSession(makeMeta('s-a2', '/a', 'a2'));
    acpStore.getState().setSessions([makeSessionInfo('s-a1', '/a')], 'a1', '/a');
    const ws = acpStore.getState().workspaces.get('/a')!;
    expect([...ws.sessions.keys()].sort()).toEqual(['s-a1', 's-a2']);
  });

  it('appendSessions adds sessions and stores the next cursor', () => {
    acpStore.getState().appendSessions([makeSessionInfo('s1', '/a')], 'a1', '/a', 'cursor-2');
    const ws = acpStore.getState().workspaces.get('/a')!;
    expect([...ws.sessions.keys()]).toEqual(['s1']);
    expect(ws.sessionListCursors.get('a1')).toBe('cursor-2');
  });

  it('appendSessions with null cursor deletes the cursor (no more pages)', () => {
    acpStore.getState().appendSessions([makeSessionInfo('s1', '/a')], 'a1', '/a', 'cursor-1');
    acpStore.getState().appendSessions([makeSessionInfo('s2', '/a')], 'a1', '/a', null);
    const ws = acpStore.getState().workspaces.get('/a')!;
    expect(ws.sessionListCursors.has('a1')).toBe(false);
    expect([...ws.sessions.keys()]).toEqual(['s1', 's2']);
  });

  it('setSessions is a no-op when the workspace does not exist', () => {
    const before = acpStore.getState();
    acpStore.getState().setSessions([makeSessionInfo('s1', '/a')], 'a1', '/nope');
    expect(acpStore.getState()).toBe(before);
  });

  it('setSessions drops the message cache for truly-removed sessions but keeps survivors', () => {
    // Seed two sessions owned by a1, with message caches in sessionStore.
    acpStore.getState().addSession(makeMeta('s1', '/a', 'a1'));
    acpStore.getState().addSession(makeMeta('s2', '/a', 'a1'));
    sessionStore.getState().ensureSession('s1');
    sessionStore.getState().ensureSession('s2');
    expect(sessionStore.getState().sessions.has('s1')).toBe(true);
    expect(sessionStore.getState().sessions.has('s2')).toBe(true);

    // Replace with a list that keeps s1 but drops s2.
    acpStore.getState().setSessions([makeSessionInfo('s1', '/a')], 'a1', '/a');

    // s2 is gone from acpStore AND its message cache was pruned.
    expect(acpStore.getState().workspaces.get('/a')!.sessions.has('s2')).toBe(false);
    expect(sessionStore.getState().sessions.has('s2')).toBe(false);
    // s1 survives in both — its message cache was NOT wiped by the replace.
    expect(acpStore.getState().workspaces.get('/a')!.sessions.has('s1')).toBe(true);
    expect(sessionStore.getState().sessions.has('s1')).toBe(true);
  });
});

describe('acpStore — single session ops', () => {
  beforeEach(() => {
    acpStore.getState().addWorkspace('/a');
  });

  it('addSession / removeSession / updateSession mutate the owning workspace', () => {
    acpStore.getState().addSession(makeMeta('s1', '/a', 'a1'));
    acpStore.getState().updateSession('s1', { title: 'Hello', loaded: true });
    expect(acpStore.getState().workspaces.get('/a')!.sessions.get('s1')!.title).toBe('Hello');
    acpStore.getState().removeSession('s1');
    expect(acpStore.getState().workspaces.get('/a')!.sessions.has('s1')).toBe(false);
  });

  it('removeSession clears activeSessionId when it was the removed one', () => {
    acpStore.getState().addSession(makeMeta('s1', '/a', 'a1'));
    acpStore.getState().setActiveSession('s1');
    acpStore.getState().removeSession('s1');
    expect(acpStore.getState().activeSessionId).toBeNull();
  });

  it('addSession / updateSession are no-ops for unknown workspace', () => {
    const before = acpStore.getState();
    acpStore.getState().addSession(makeMeta('s1', '/nope', 'a1'));
    acpStore.getState().updateSession('s1', { title: 'x' });
    expect(acpStore.getState()).toBe(before);
  });
});

describe('acpStore — active session', () => {
  beforeEach(() => {
    acpStore.getState().addWorkspace('/a');
    acpStore.getState().addSession(makeMeta('s1', '/a', 'a1'));
  });

  it('setActiveSession validates the session exists in some workspace', () => {
    acpStore.getState().setActiveSession('s1');
    expect(acpStore.getState().activeSessionId).toBe('s1');
  });

  it('setActiveSession ignores an unknown session id', () => {
    acpStore.getState().setActiveSession('nope');
    expect(acpStore.getState().activeSessionId).toBeNull();
  });

  it('setActiveSession(null) clears immediately', () => {
    acpStore.getState().setActiveSession('s1');
    acpStore.getState().setActiveSession(null);
    expect(acpStore.getState().activeSessionId).toBeNull();
  });

  it('setActiveSession is idempotent for the same id', () => {
    acpStore.getState().setActiveSession('s1');
    const before = acpStore.getState();
    acpStore.getState().setActiveSession('s1');
    expect(acpStore.getState()).toBe(before);
  });
});

describe('acpStore — auth', () => {
  it('setAuthRequired / clearAuthRequired toggle pendingAuth', () => {
    acpStore.getState().setAuthRequired('a1');
    expect(acpStore.getState().pendingAuth).toEqual({ agentId: 'a1' });
    acpStore.getState().clearAuthRequired();
    expect(acpStore.getState().pendingAuth).toBeNull();
  });
});
