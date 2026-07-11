import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock AcpClient so we can drive `createAcpProvider` without a real transport.
//
// The mock's constructor pushes every created instance into the module-level
// `captured` array. Tests read `captured[0]` to emit fake SessionNotifications
// through the registered `onSessionUpdate` handler, then advance fake timers to
// exercise the 16ms chunk-batching window.
// ---------------------------------------------------------------------------

export type SessionUpdateHandler = (n: any) => void;
export type StatusHandler = (s: any) => void;
export type CloseHandler = () => void;

export interface CapturedClient {
  onSessionUpdateHandlers: Set<SessionUpdateHandler>;
  onStatusChangeHandlers: Set<StatusHandler>;
  closeHandlers: Set<CloseHandler>;
  connect: ReturnType<typeof vi.fn>;
  initialize: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  listSessions: ReturnType<typeof vi.fn>;
  setPermissionHandler: ReturnType<typeof vi.fn>;
  setStdioTransportFactory: ReturnType<typeof vi.fn>;
  /** The permission handler the provider installed (drives fake requests). */
  permissionHandler: ((req: any) => Promise<any>) | null;
  agentInfo: any;
  capabilities: any;
}

export const captured: CapturedClient[] = [];

vi.mock('./client/AcpClient', () => {
  class FakeAcpClient {
    onSessionUpdateHandlers = new Set<SessionUpdateHandler>();
    onStatusChangeHandlers = new Set<StatusHandler>();
    closeHandlers = new Set<CloseHandler>();
    agentInfo = { name: 'fake-agent', version: '1.0.0' };
    capabilities = { sessionCapabilities: { list: true } };
    // Captured view is written here in the constructor; `setPermissionHandler`
    // keeps its `permissionHandler` field in sync so tests read the live handler.
    private view: CapturedClient | null = null;

    connect = vi.fn(async () => {});
    initialize = vi.fn(async () => ({
      protocolVersion: 1,
      agentInfo: this.agentInfo,
      agentCapabilities: this.capabilities,
      authMethods: [],
    }));
    listSessions = vi.fn(async () => ({ sessions: [], nextCursor: null }));
    disconnect = vi.fn();
    setPermissionHandler = vi.fn((handler: (req: any) => Promise<any>) => {
      if (this.view) this.view.permissionHandler = handler;
    });
    // The provider injects a host stdio transport factory before connecting;
    // tests don't drive a real transport, so a no-op satisfies the interface.
    setStdioTransportFactory = vi.fn();

    onSessionUpdate(handler: SessionUpdateHandler) {
      this.onSessionUpdateHandlers.add(handler);
      return () => this.onSessionUpdateHandlers.delete(handler);
    }
    onStatusChange(handler: StatusHandler) {
      this.onStatusChangeHandlers.add(handler);
      return () => this.onStatusChangeHandlers.delete(handler);
    }
    onClose(handler: CloseHandler) {
      this.closeHandlers.add(handler);
      return () => this.closeHandlers.delete(handler);
    }

    constructor() {
      // Capture a view of this instance so tests can drive its handlers.
      const view: CapturedClient = {
        onSessionUpdateHandlers: this.onSessionUpdateHandlers,
        onStatusChangeHandlers: this.onStatusChangeHandlers,
        closeHandlers: this.closeHandlers,
        connect: this.connect,
        initialize: this.initialize,
        disconnect: this.disconnect,
        listSessions: this.listSessions,
        setPermissionHandler: this.setPermissionHandler,
        setStdioTransportFactory: this.setStdioTransportFactory,
        // Populated by `setPermissionHandler`; null until the provider installs one.
        permissionHandler: null,
        agentInfo: this.agentInfo,
        capabilities: this.capabilities,
      };
      this.view = view;
      captured.push(view);
    }
  }
  return { AcpClient: FakeAcpClient };
});

// Import AFTER the mock is registered.
import { createAcpProvider } from './provider';
import { acpStore } from './store/acpStore';
import { sessionStore } from './store/sessionStore';
import { skillStore } from './store/skillStore';

// ---------------------------------------------------------------------------
// Helpers — ACP notification shape: { sessionId, update: { sessionUpdate, ... } }
// ---------------------------------------------------------------------------

const SID = 'sess-1';

function textBlock(text: string) {
  return { type: 'text', text, _meta: null, annotations: null };
}
function annotatedTextBlock(text: string) {
  return { type: 'text', text, _meta: null, annotations: { audience: ['assistant'] } };
}
function imageBlock() {
  return { type: 'image', data: 'AAAA', mimeType: 'image/png', _meta: null, annotations: null };
}

function emit(client: CapturedClient, update: Record<string, unknown>): void {
  for (const h of client.onSessionUpdateHandlers) h({ sessionId: SID, update });
}

function getMessages() {
  return sessionStore.getState().sessions.get(SID)?.messages ?? [];
}

/** Concatenated text of the content part of message[idx] (default first). */
function contentText(idx = 0): string {
  const msg = getMessages()[idx];
  if (!msg) return '';
  for (let i = msg.parts.length - 1; i >= 0; i--) {
    const part = msg.parts[i];
    if (part.type === 'content') {
      return (part.content as Array<{ text?: string }>).map((b) => b.text ?? '').join('');
    }
  }
  return '';
}

/**
 * Drive the provider-installed permission handler for `sessionId` exactly as the
 * ACP SDK would on an inbound `session/request_permission`. Returns the Promise
 * the handler produced — the test asserts how/whether it settles.
 */
function requestPermission(
  client: CapturedClient,
  sessionId: string,
  options: Array<{ optionId: string }> = [{ optionId: 'allow' }],
): Promise<unknown> {
  const handler = client.permissionHandler;
  if (!handler) throw new Error('provider did not install a permission handler');
  return handler({
    sessionId,
    toolCall: { toolCallId: 'tc-perm', title: 'Needs approval' },
    options,
  });
}

/** Fire the client's `onClose` handlers, simulating the agent process dying. */
function fireClose(client: CapturedClient): void {
  for (const h of client.closeHandlers) h();
}

function resetStores(): void {
  acpStore.setState({
    agents: new Map(),
    workspaces: new Map(),
    activeSessionId: null,
    pendingAuth: null,
  });
  sessionStore.setState({ sessions: new Map() });
  skillStore.setState({ skillsByAgent: new Map() });
}

/** Build a provider with one agent and flush microtasks/timers until ready. */
async function makeProvider(): Promise<{ provider: ReturnType<typeof createAcpProvider>; client: CapturedClient }> {
  const provider = createAcpProvider({
    agents: [{ id: 'a1', name: 'A1', transport: { type: 'http', url: 'http://x' } }],
  });
  // Let Promise.allSettled + connectAgent + initialize resolve.
  await vi.runAllTimersAsync();
  await Promise.resolve();
  await Promise.resolve();
  await vi.runAllTimersAsync();

  expect(captured.length).toBeGreaterThanOrEqual(1);
  return { provider, client: captured[0] };
}

beforeEach(() => {
  resetStores();
  captured.length = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Provider wiring (smoke)
// ---------------------------------------------------------------------------

describe('createAcpProvider — wiring', () => {
  it('registers the agent in the store and flips ready after init', async () => {
    const { provider } = await makeProvider();
    expect(acpStore.getState().agents.has('a1')).toBe(true);
    expect(provider.ready).toBe(true);
    provider.destroy();
  });

  it('getClient returns the connected client', async () => {
    const { provider } = await makeProvider();
    expect(provider.getClient('a1')).toBeDefined();
    expect(provider.getClient('nope')).toBeNull();
    provider.destroy();
  });

  it('subscribe fires when ready flips', async () => {
    const fn = vi.fn();
    const provider = createAcpProvider({
      agents: [{ id: 'a1', name: 'A1', transport: { type: 'http', url: 'http://x' } }],
    });
    const unsub = provider.subscribe(fn);
    await vi.runAllTimersAsync();
    await Promise.resolve();
    expect(fn).toHaveBeenCalled();
    unsub();
    provider.destroy();
  });
});

// ---------------------------------------------------------------------------
// Chunk batching — the core behavior under test
// ---------------------------------------------------------------------------

describe('createAcpProvider — chunk batching', () => {
  it('buffers consecutive text chunks and flushes them as one merged message after the window', async () => {
    const { provider, client } = await makeProvider();

    emit(client, { sessionUpdate: 'agent_message_chunk', content: textBlock('Hel'), messageId: 'm1' });
    emit(client, { sessionUpdate: 'agent_message_chunk', content: textBlock('lo'), messageId: 'm1' });

    // Within the 16ms window → nothing committed yet.
    expect(getMessages()).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(16);

    expect(getMessages()).toHaveLength(1);
    expect(getMessages()[0].role).toBe('agent');
    expect(contentText(0)).toBe('Hello');
    provider.destroy();
  });

  it('flushes buffered text BEFORE applying a non-text block (ordering preserved)', async () => {
    const { provider, client } = await makeProvider();

    emit(client, { sessionUpdate: 'agent_message_chunk', content: textBlock('Hel'), messageId: 'm1' });
    emit(client, { sessionUpdate: 'agent_message_chunk', content: imageBlock(), messageId: 'm1' });

    // Non-text block forces immediate flush of buffered text, then appends.
    expect(getMessages()).toHaveLength(1);
    const part = getMessages()[0].parts[0];
    expect(part.type).toBe('content');
    if (part.type === 'content') {
      expect(part.content[0]).toMatchObject({ type: 'text', text: 'Hel' });
      expect(part.content[1]).toMatchObject({ type: 'image' });
    }
    provider.destroy();
  });

  it('does NOT merge annotated text onto the previous plain text block', async () => {
    const { provider, client } = await makeProvider();

    emit(client, { sessionUpdate: 'agent_message_chunk', content: textBlock('Hel'), messageId: 'm1' });
    // Annotated text is not a batchable text block → flush + direct append.
    emit(client, { sessionUpdate: 'agent_message_chunk', content: annotatedTextBlock('lo'), messageId: 'm1' });

    await vi.advanceTimersByTimeAsync(16);

    const part = getMessages()[0].parts[0];
    if (part.type === 'content') {
      expect(part.content).toHaveLength(2);
      expect(part.content[0]).toMatchObject({ type: 'text', text: 'Hel' });
      expect(part.content[1]).toMatchObject({ type: 'text', text: 'lo' });
    }
    provider.destroy();
  });

  it('flushes buffered text before a tool_call and upserts the tool call', async () => {
    const { provider, client } = await makeProvider();

    emit(client, { sessionUpdate: 'agent_message_chunk', content: textBlock('thinking'), messageId: 'm1' });
    emit(client, {
      sessionUpdate: 'tool_call',
      toolCallId: 'tc-1',
      title: 'Read file',
      status: 'in_progress',
      kind: 'read',
      content: [],
      locations: [],
      rawInput: null,
      rawOutput: null,
    });

    const msg = getMessages()[0];
    expect(msg.role).toBe('agent');
    const partTypes = msg.parts.map((p) => p.type);
    expect(partTypes).toContain('content');
    expect(partTypes).toContain('tool_calls');
    expect(contentText(0)).toBe('thinking');
    expect(sessionStore.getState().sessions.get(SID)!.pendingToolCalls.has('tc-1')).toBe(true);
    provider.destroy();
  });

  it('routes agent_message_chunk vs user_message_chunk to separate messages', async () => {
    const { provider, client } = await makeProvider();

    emit(client, { sessionUpdate: 'agent_message_chunk', content: textBlock('agent says'), messageId: 'a1' });
    emit(client, { sessionUpdate: 'user_message_chunk', content: textBlock('user says'), messageId: 'u1' });

    await vi.advanceTimersByTimeAsync(16);

    const msgs = getMessages();
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('agent');
    expect(msgs[1].role).toBe('user');
    provider.destroy();
  });

  it('routes agent_thought_chunk through appendThought', async () => {
    const { provider, client } = await makeProvider();

    emit(client, { sessionUpdate: 'agent_thought_chunk', content: textBlock('thin'), messageId: 'th1' });
    emit(client, { sessionUpdate: 'agent_thought_chunk', content: textBlock('king'), messageId: 'th1' });

    await vi.advanceTimersByTimeAsync(16);

    const part = getMessages()[0].parts[0];
    expect(part.type).toBe('thought');
    if (part.type === 'thought') {
      expect((part.thought as Array<{ text: string }>).map((b) => b.text).join('')).toBe('thinking');
    }
    provider.destroy();
  });

  it('isolates per-session buffers (another session’s tool call does not flush this session’s text)', async () => {
    const { provider, client } = await makeProvider();
    const SID2 = 'sess-2';

    emit(client, { sessionUpdate: 'agent_message_chunk', content: textBlock('s1-text'), messageId: 'm1' });
    // Emit a tool_call on a DIFFERENT session.
    for (const h of client.onSessionUpdateHandlers) {
      h({
        sessionId: SID2,
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-2',
          title: 'T',
          status: 'in_progress',
          content: [],
          locations: [],
          rawInput: null,
          rawOutput: null,
        },
      });
    }

    // Session 1’s buffer was not flushed by the other session’s tool call.
    expect(getMessages()).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(16);
    expect(contentText(0)).toBe('s1-text');
    provider.destroy();
  });

  it('routes plan / usage_update / session_info_update / config_option_update / available_commands_update', async () => {
    const { provider, client } = await makeProvider();
    // ensureSession is called by the handler on the first update; but for the
    // non-message updates we attach the session to a workspace too so
    // session_info_update can be routed into acpStore.
    acpStore.getState().addWorkspace('/w');
    acpStore.getState().addSession({ id: SID, cwd: '/w', agentId: 'a1', loaded: true });

    emit(client, {
      sessionUpdate: 'plan',
      entries: [{ content: 'step', priority: 'high', status: 'pending' }],
    });
    expect(sessionStore.getState().sessions.get(SID)!.plan).toHaveLength(1);

    emit(client, { sessionUpdate: 'usage_update', size: 100, used: 50, _meta: null });
    expect(sessionStore.getState().sessions.get(SID)!.usage).toMatchObject({ size: 100, used: 50 });

    emit(client, { sessionUpdate: 'session_info_update', title: 'New Title', updatedAt: '2026-01-01' });
    expect(acpStore.getState().workspaces.get('/w')!.sessions.get(SID)!.title).toBe('New Title');

    emit(client, {
      sessionUpdate: 'config_option_update',
      configOptions: [{ id: 'model', type: 'select', name: 'Model', options: [] } as unknown as any],
    });
    expect(sessionStore.getState().sessions.get(SID)!.configOptions).toHaveLength(1);

    emit(client, {
      sessionUpdate: 'available_commands_update',
      availableCommands: [{ name: 'plan', description: 'make a plan' }],
    });
    expect(sessionStore.getState().sessions.get(SID)!.availableCommands).toHaveLength(1);

    provider.destroy();
  });

  it('destroy() flushes pending buffered text so no data is lost', async () => {
    const { provider, client } = await makeProvider();

    emit(client, { sessionUpdate: 'agent_message_chunk', content: textBlock('unflushed'), messageId: 'm1' });
    expect(getMessages()).toHaveLength(0);

    provider.destroy();

    // Destroy flushes the pending batch even though the timer never fired.
    expect(getMessages()).toHaveLength(1);
    expect(contentText(0)).toBe('unflushed');
  });
});

// ---------------------------------------------------------------------------
// Permission lifecycle — the provider must settle outstanding permission
// Promises when a session is removed or the agent disconnects, otherwise the
// agent's `session/request_permission` RPC hangs forever and the Promise leaks.
// ---------------------------------------------------------------------------
describe('createAcpProvider — permission lifecycle', () => {
  it('rejects a pending permission when the session is removed', async () => {
    const { provider, client } = await makeProvider();

    const p = requestPermission(client, SID);
    // Still pending — no user response, no resolution yet.
    const pending = vi.fn();
    p.then(pending);
    await Promise.resolve();
    expect(pending).not.toHaveBeenCalled();
    expect(sessionStore.getState().sessions.get(SID)!.pendingPermissions).toHaveLength(1);

    // Removing the session must reject the orphaned permission Promise.
    sessionStore.getState().removeSession(SID);
    await Promise.resolve();
    await Promise.resolve();
    expect(pending).toHaveBeenCalledTimes(1);
    expect(await p).toMatchObject({ outcome: { outcome: 'cancelled' } });
    // Session (and its pending queue) is gone.
    expect(sessionStore.getState().sessions.has(SID)).toBe(false);
    provider.destroy();
  });

  it('rejects a pending permission when the session is reset', async () => {
    const { provider, client } = await makeProvider();

    const p = requestPermission(client, SID);
    sessionStore.getState().resetSession(SID);
    await Promise.resolve();
    await Promise.resolve();
    // Reset re-creates the session entry but with an empty queue; the Promise settled.
    expect(await p).toMatchObject({ outcome: { outcome: 'cancelled' } });
    expect(sessionStore.getState().sessions.get(SID)!.pendingPermissions).toHaveLength(0);
    provider.destroy();
  });

  it('rejects pending permissions for the disconnecting client on close', async () => {
    const { provider, client } = await makeProvider();
    // Have the agent report SID as one of its sessions so the workspace refresh
    // (triggered by addWorkspace) reconciles to [SID] rather than [] — otherwise
    // the auto-refresh would correctly orphan the manually-added session and drop
    // its message cache before close fires, masking the permission cleanup.
    client.listSessions.mockResolvedValue({
      sessions: [{ sessionId: SID, cwd: '/w', title: null, updatedAt: null }],
      nextCursor: null,
    });
    // Attach the session to a workspace so it maps to agent 'a1'.
    acpStore.getState().addWorkspace('/w');
    acpStore.getState().addSession({ id: SID, cwd: '/w', agentId: 'a1', loaded: true });
    // Let the workspace-refresh `listSessions` settle so the session is reconciled.
    await vi.runAllTimersAsync();
    await Promise.resolve();

    const p1 = requestPermission(client, SID);
    const p2 = requestPermission(client, SID); // a second queued request
    expect(sessionStore.getState().sessions.get(SID)!.pendingPermissions).toHaveLength(2);

    // Simulate the agent process dying → client fires onClose.
    fireClose(client);
    await Promise.resolve();
    await Promise.resolve();

    // Both pending Promises settle with `cancelled`; the dialog queue is cleared.
    expect(await p1).toMatchObject({ outcome: { outcome: 'cancelled' } });
    expect(await p2).toMatchObject({ outcome: { outcome: 'cancelled' } });
    expect(sessionStore.getState().sessions.get(SID)!.pendingPermissions).toHaveLength(0);
    provider.destroy();
  });

  it('reject is idempotent — explicit deny after a close does not double-settle', async () => {
    const { provider, client } = await makeProvider();
    acpStore.getState().addWorkspace('/w');
    acpStore.getState().addSession({ id: SID, cwd: '/w', agentId: 'a1', loaded: true });

    let settled = 0;
    const p = requestPermission(client, SID);
    p.then(() => { settled++; });

    fireClose(client);
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(1);

    // A stray late `denyPermission` (e.g. a stale UI action) must NOT settle again.
    const { denyPermission } = await import('./actions/permission');
    expect(() => denyPermission(SID)).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(1);
    provider.destroy();
  });
});

// ---------------------------------------------------------------------------
// Agent removal — `removeAgent` must also drop the agent's skill catalog so
// the per-agent `skillsByAgent` Map doesn't grow unbounded as agents cycle.
// ---------------------------------------------------------------------------
describe('createAcpProvider — removeAgent cleans up skillStore', () => {
  it('drops the removed agent’s skill catalog', async () => {
    const { provider } = await makeProvider();
    skillStore.getState().setAgentSkills('a1', [{ id: 'sk-1', name: 'Skill One' }]);
    expect(skillStore.getState().skillsByAgent.has('a1')).toBe(true);

    await provider.removeAgent('a1');

    expect(acpStore.getState().agents.has('a1')).toBe(false);
    expect(skillStore.getState().skillsByAgent.has('a1')).toBe(false);
    provider.destroy();
  });

  it('leaves other agents’ skill catalogs intact', async () => {
    const provider = createAcpProvider({
      agents: [
        { id: 'a1', name: 'A1', transport: { type: 'http', url: 'http://x' } },
        { id: 'a2', name: 'A2', transport: { type: 'http', url: 'http://y' } },
      ],
    });
    await vi.runAllTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
    await vi.runAllTimersAsync();

    skillStore.getState().setAgentSkills('a1', [{ id: 'sk-1', name: 'Skill One' }]);
    skillStore.getState().setAgentSkills('a2', [{ id: 'sk-2', name: 'Skill Two' }]);

    await provider.removeAgent('a1');

    expect(skillStore.getState().skillsByAgent.has('a1')).toBe(false);
    expect(skillStore.getState().skillsByAgent.has('a2')).toBe(true);
    provider.destroy();
  });
});
