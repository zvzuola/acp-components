import {
  client,
  methods,
  type ClientConnection,
  type ClientContext,
  type SessionNotification,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type PromptRequest,
  type PromptResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  type InitializeRequest,
  type InitializeResponse,
  type ListSessionsRequest,
  type ListSessionsResponse,
  type LoadSessionRequest,
  type LoadSessionResponse,
  type SetSessionConfigOptionRequest,
  type SetSessionConfigOptionResponse,
  type CancelNotification,
  type ClientCapabilities,
  type CloseSessionRequest,
  type CloseSessionResponse,
  type DeleteSessionRequest,
  type DeleteSessionResponse,
  type ForkSessionRequest,
  type ForkSessionResponse,
  type AuthenticateRequest,
  type AuthenticateResponse,
  type AgentCapabilities,
} from '@agentclientprotocol/sdk';
import { HttpTransport, WebSocketTransport } from '../transport';
import type { AcpTransport, StdioTransportOptions } from '../transport';
import type { ConnectionStatus, Implementation, TransportConfig } from '../types';
import type { Skill } from '../store/skillStore';

/**
 * Host-injected factory that turns a stdio spawn config into a concrete
 * `AcpTransport`. core does not own a stdio spawn implementation (spawning a
 * child process is a host-native capability a browser cannot back), so a host
 * provides this via `Platform.process.createStdioTransport`; the React
 * `AcpProvider` resolves it and injects it through `createAcpProvider`. When
 * unset, a `{ type: 'stdio' }` config fails fast at connect time.
 */
export type StdioTransportFactory = (options: StdioTransportOptions) => AcpTransport;

export type SessionUpdateHandler = (update: SessionNotification) => void;
export type PermissionHandler = (request: RequestPermissionRequest) => Promise<RequestPermissionResponse>;

/**
 * A skill entry already normalized to the core `Skill` shape, paired with the
 * source workspace root it was reported for (when the agent returns a
 * per-cwd grouped response).
 */
interface NormalizedSkillEntry {
  cwd?: string;
  skill: Skill;
}

/**
 * Pull skills out of an arbitrary `_acp/skills/list` response, preserving the
 * source `cwd` when the agent returns a per-workspace grouped result.
 *
 * Supported response shapes (most-specific first):
 *  1. Per-cwd grouped array: `[{ cwd: "/a", skills: [...] }, ...]` — emitted
 *     when `listSkills(cwds)` is called with one or more workspaces. Each
 *     skill is tagged with its entry's `cwd`.
 *  2. Bare flat array: `[skill, skill, ...]` (no `cwd` context).
 *  3. Enveloped: `{ skills: [...] }` or `{ data: [...] }`.
 *
 * Elements that are not skill records are dropped. Unknown fields are
 * tolerated by `normalizeSkill`.
 */
function extractSkillEntries(res: unknown): NormalizedSkillEntry[] {
  const arr = Array.isArray(res)
    ? res
    : Array.isArray((res as Record<string, unknown> | null | undefined)?.skills)
      ? (res as Record<string, unknown>).skills as unknown[]
      : Array.isArray((res as Record<string, unknown> | null | undefined)?.data)
        ? (res as Record<string, unknown>).data as unknown[]
        : [];

  const entries: NormalizedSkillEntry[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    // Per-cwd grouped entry: `{ cwd, skills: [...] }`. Detect by a `skills`
    // array (and a stringish `cwd`); the inner array is the real skill list.
    const inner = Array.isArray(rec.skills) ? rec.skills as unknown[] : null;
    if (inner) {
      const cwd = typeof rec.cwd === 'string' ? rec.cwd : undefined;
      for (const s of inner) {
        if (!s || typeof s !== 'object') continue;
        entries.push({ cwd, skill: normalizeSkill(s as Record<string, unknown>) });
      }
    } else {
      entries.push({ cwd: undefined, skill: normalizeSkill(rec) });
    }
  }
  return entries;
}

/**
 * Map an agent-provided skill record onto the core `Skill` shape. Accepts a few
 * common field aliases (`name`/`title`, `description`/`desc`) and tolerates
 * missing fields — only `id`/`name` are required on the output.
 */
function normalizeSkill(raw: Record<string, unknown>): Skill {
  const id = String(raw.id ?? raw.skillId ?? raw.name ?? '');
  const name = String(raw.name ?? raw.title ?? id);
  const description =
    raw.description != null ? String(raw.description)
      : raw.desc != null ? String(raw.desc)
        : undefined;
  const group = raw.group != null ? String(raw.group) : raw.source != null ? String(raw.source) : undefined;
  const iconName = raw.iconName != null ? String(raw.iconName) : raw.icon != null ? String(raw.icon) : undefined;
  const disabled = typeof raw.disabled === 'boolean' ? raw.disabled : undefined;
  const skill: Skill = { id, name };
  if (description !== undefined) skill.description = description;
  if (group !== undefined) skill.group = group;
  if (iconName !== undefined) skill.iconName = iconName;
  if (disabled !== undefined) skill.disabled = disabled;
  return skill;
}

function createTransport(
  config: TransportConfig,
  stdioFactory: StdioTransportFactory | null,
): AcpTransport {
  switch (config.type) {
    case 'stdio':
      if (!stdioFactory) {
        // No host stdio capability was injected (e.g. a web platform that cannot
        // spawn a process). Fail fast here rather than inside a baked-in spawn
        // — the host must provide `Platform.process.createStdioTransport`.
        throw new Error(
          'stdio transport requires a host-provided factory (Platform.process.createStdioTransport); none was injected.',
        );
      }
      return stdioFactory({ command: config.command, args: config.args, env: config.env });
    case 'http':
      return new HttpTransport({ url: config.url, headers: config.headers });
    case 'websocket':
      return new WebSocketTransport({ url: config.url });
    case 'custom':
      return config.transport;
    default:
      throw new Error(`Unsupported transport type: ${(config as TransportConfig).type}`);
  }
}

export class AcpClient {
  private connection: ClientConnection | null = null;
  private context: ClientContext | null = null;
  private transport: AcpTransport | null = null;
  private _transportConfig: TransportConfig | null = null;
  private _status: ConnectionStatus = 'disconnected';
  private _agentInfo: Implementation | null = null;
  private _capabilities: AgentCapabilities | null = null;
  private _clientInfo: Implementation | undefined = undefined;
  private _clientCapabilities: ClientCapabilities | undefined = undefined;

  private sessionUpdateHandlers = new Set<SessionUpdateHandler>();
  private permissionHandler: PermissionHandler | null = null;
  private statusHandlers = new Set<(status: ConnectionStatus) => void>();
  private closeHandlers = new Set<() => void>();
  /**
   * Host-injected stdio transport factory (`Platform.process.createStdioTransport`).
   * Resolved by the React `AcpProvider` and injected before `connect()`. `null`
   * means the host cannot spawn a process — a `{ type: 'stdio' }` config then
   * throws in `createTransport`.
   */
  private stdioFactory: StdioTransportFactory | null = null;

  /**
   * Inject the host stdio transport factory. Called once by the provider before
   * connecting each agent; subsequent calls replace the previous factory (used
   * when the host swaps its `Platform` capability set at runtime).
   */
  setStdioTransportFactory(factory: StdioTransportFactory | null): void {
    this.stdioFactory = factory;
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  get agentInfo(): Implementation | null {
    return this._agentInfo;
  }

  get capabilities(): AgentCapabilities | null {
    return this._capabilities;
  }

  get signal(): AbortSignal | undefined {
    return this.connection?.signal;
  }

  private setStatus(status: ConnectionStatus): void {
    this._status = status;
    for (const h of this.statusHandlers) h(status);
  }

  onStatusChange(handler: (status: ConnectionStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  onClose(handler: () => void): () => void {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  onSessionUpdate(handler: SessionUpdateHandler): () => void {
    this.sessionUpdateHandlers.add(handler);
    return () => this.sessionUpdateHandlers.delete(handler);
  }

  setPermissionHandler(handler: PermissionHandler): void {
    this.permissionHandler = handler;
  }

  async connect(config: TransportConfig): Promise<void> {
    if (this._status === 'connecting') {
      return;
    }
    if (this.transport || this.connection) {
      this.disconnect();
    }
    this._transportConfig = config;
    this.transport = createTransport(config, this.stdioFactory);
    this.setStatus('connecting');

    this.transport.onClose?.(() => {
      this.setStatus('disconnected');
    });

    this.transport.onError?.((_err) => {
      this.setStatus('error');
    });

    let stream: Awaited<ReturnType<AcpTransport['connect']>>;
    try {
      stream = await this.transport.connect();
    } catch (err) {
      this.setStatus('error');
      this.transport = null;
      throw err;
    }

    // Build the client app and register the built-in agent→client handlers
    // BEFORE connecting (the app-builder API requires handlers up front). The
    // permission handler delegates to a run-time-replaceable field, so callers
    // can still setPermissionHandler after connect().
    const app = client({ name: 'acp-components-client' })
      .onNotification(methods.client.session.update, (ctx) => {
        for (const h of this.sessionUpdateHandlers) h(ctx.params);
      })
      .onRequest(methods.client.session.requestPermission, (ctx) => this.handlePermission(ctx.params));

    this.connection = app.connect(stream);
    this.context = this.connection.agent;

    this.connection.closed.then(() => {
      this.setStatus('disconnected');
      for (const h of this.closeHandlers) h();
      this.closeHandlers.clear();
    }).catch(() => {
      this.setStatus('disconnected');
      for (const h of this.closeHandlers) h();
      this.closeHandlers.clear();
    });
  }

  /**
   * Resolve a `session/request_permission` request. Delegates to the
   * permission handler if set; otherwise auto-selects the first option
   * (preserving the legacy behaviour).
   */
  private async handlePermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    if (this.permissionHandler) {
      return this.permissionHandler(params);
    }
    return {
      outcome: { outcome: 'selected', optionId: params.options[0]?.optionId ?? '' },
    };
  }

  async initialize(clientInfo?: Implementation, clientCapabilities?: ClientCapabilities): Promise<InitializeResponse> {
    if (!this.context) throw new Error('Not connected');

    this._clientInfo = clientInfo;
    this._clientCapabilities = clientCapabilities;

    const req: InitializeRequest = {
      protocolVersion: 1,
      clientInfo: clientInfo ?? null,
      clientCapabilities: clientCapabilities ?? undefined,
    };

    const res = await this.context.request(methods.agent.initialize, req);
    this._agentInfo = res.agentInfo ?? null;
    this._capabilities = res.agentCapabilities ?? null;
    this.setStatus('connected');
    return res;
  }

  async newSession(cwd: string, mcpServers: NewSessionRequest['mcpServers'] = []): Promise<NewSessionResponse> {
    if (!this.context) throw new Error('Not connected');
    return this.context.request(methods.agent.session.new, { cwd, mcpServers });
  }

  async forkSession(sessionId: string, cwd: string, mcpServers: ForkSessionRequest['mcpServers'] = []): Promise<ForkSessionResponse> {
    if (!this.context) throw new Error('Not connected');
    return this.context.request(methods.agent.session.fork, { sessionId, cwd, mcpServers });
  }

  async prompt(sessionId: string, prompt: PromptRequest['prompt']): Promise<PromptResponse> {
    if (!this.context) throw new Error('Not connected');
    return this.context.request(methods.agent.session.prompt, { sessionId, prompt });
  }

  async cancel(sessionId: string): Promise<void> {
    if (!this.context) throw new Error('Not connected');
    const params: CancelNotification = { sessionId };
    await this.context.notify(methods.agent.session.cancel, params);
  }

  async listSessions(cursor?: string, cwd?: string): Promise<ListSessionsResponse> {
    if (!this.context) throw new Error('Not connected');
    const params: ListSessionsRequest = {};
    if (cursor) params.cursor = cursor;
    if (cwd) params.cwd = cwd;
    return this.context.request(methods.agent.session.list, params);
  }

  async loadSession(sessionId: string, cwd: string, mcpServers: LoadSessionRequest['mcpServers'] = []): Promise<LoadSessionResponse> {
    if (!this.context) throw new Error('Not connected');
    return this.context.request(methods.agent.session.load, { sessionId, cwd, mcpServers });
  }

  async setSessionConfigOption(sessionId: string, configId: string, value: string | boolean): Promise<SetSessionConfigOptionResponse> {
    if (!this.context) throw new Error('Not connected');
    const params: SetSessionConfigOptionRequest = { sessionId, configId } as SetSessionConfigOptionRequest;
    if (typeof value === 'boolean') {
      (params as Record<string, unknown>).type = 'boolean';
      (params as Record<string, unknown>).value = value;
    } else {
      (params as Record<string, unknown>).value = value;
    }
    return this.context.request(methods.agent.session.setConfigOption, params);
  }

  async closeSession(sessionId: string): Promise<CloseSessionResponse> {
    if (!this.context) throw new Error('Not connected');
    const params: CloseSessionRequest = { sessionId };
    return this.context.request(methods.agent.session.close, params);
  }

  async deleteSession(sessionId: string): Promise<DeleteSessionResponse> {
    if (!this.context) throw new Error('Not connected');
    const params: DeleteSessionRequest = { sessionId };
    return this.context.request(methods.agent.session.delete, params);
  }

  async authenticate(methodId: string): Promise<AuthenticateResponse> {
    if (!this.context) throw new Error('Not connected');
    const params: AuthenticateRequest = { methodId };
    return this.context.request(methods.agent.authenticate, params);
  }

  async extMethod(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.context) throw new Error('Not connected');
    return this.context.request<Record<string, unknown>, Record<string, unknown>>(method, params);
  }

  /**
   * Fetch the agent's skill catalog via the `_acp/skills/list` extension method.
   *
   * @param cwds Optional list of every workspace path the user currently has
   *   open. Forwarded to the agent so it can scope/filter the skills it reports
   *   (e.g. only return skills that apply to the open project roots). When
   *   provided, the agent is expected to return a per-cwd grouped array —
   *   `[{ cwd: "/a", skills: [...] }, ...]` — and each returned skill is
   *   stamped with the `cwd` of the entry it came from. Omit when the caller
   *   has no workspace context; the agent then returns a flat global catalog
   *   (no `cwd` on the skills). Unknown/optional fields are stripped before
   *   sending.
   */
  async listSkills(cwds?: string[]): Promise<Skill[]> {
    if (!this.context) throw new Error('Not connected');
    const params: Record<string, unknown> = {};
    if (cwds && cwds.length > 0) params.cwds = cwds;
    const res = await this.extMethod('_acp/skills/list', params);
    const entries = extractSkillEntries(res);
    return entries.map(({ cwd, skill }) => {
      if (cwd !== undefined) skill.cwd = cwd;
      return skill;
    });
  }

  async extNotification(method: string, params: Record<string, unknown>): Promise<void> {
    if (!this.context) throw new Error('Not connected');
    await this.context.notify<Record<string, unknown>>(method, params);
  }

  disconnect(): void {
    this.transport?.disconnect();
    this.connection?.close();
    // connection.closed handler fires async → setStatus + closeHandlers + clear
    this.connection = null;
    this.context = null;
    this.transport = null;
  }

  async reconnectWithEnv(additionalEnv: Record<string, string>): Promise<InitializeResponse> {
    if (!this._transportConfig) throw new Error('Not connected');
    this.disconnect();
    // Reset status so connect() allows reconnection
    this._status = 'disconnected';

    // Merge additional env vars into transport config
    const config = { ...this._transportConfig };
    if (config.type === 'stdio') {
      config.env = { ...config.env, ...additionalEnv };
    }
    this._transportConfig = config;

    await this.connect(config);
    return this.initialize(this._clientInfo, this._clientCapabilities);
  }
}
