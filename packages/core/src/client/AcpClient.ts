import {
  ClientSideConnection,
  type Agent,
  type Client,
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
  type ReadTextFileRequest,
  type ReadTextFileResponse,
  type WriteTextFileRequest,
  type WriteTextFileResponse,
  type ClientCapabilities,
  type CreateTerminalRequest,
  type TerminalOutputRequest,
  type ReleaseTerminalRequest,
  type WaitForTerminalExitRequest,
  type KillTerminalRequest,
  type CloseSessionRequest,
  type CloseSessionResponse,
  type AuthenticateRequest,
  type AuthenticateResponse,
} from '@agentclientprotocol/sdk';
import type { AgentCapabilities } from '@agentclientprotocol/sdk';
import { StdioTransport, HttpTransport, WebSocketTransport } from '../transport';
import type { AcpTransport } from '../transport';
import type { ConnectionStatus, Implementation, TransportConfig, TerminalHandler } from '../types';

export type SessionUpdateHandler = (update: SessionNotification) => void;
export type PermissionHandler = (request: RequestPermissionRequest) => Promise<RequestPermissionResponse>;
export type FileReadHandler = (request: ReadTextFileRequest) => Promise<ReadTextFileResponse>;
export type FileWriteHandler = (request: WriteTextFileRequest) => Promise<WriteTextFileResponse>;
export type ExtMethodHandler = (method: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;
export type ExtNotificationHandler = (method: string, params: Record<string, unknown>) => void;

function createTransport(config: TransportConfig): AcpTransport {
  switch (config.type) {
    case 'stdio':
      return new StdioTransport({ command: config.command, args: config.args, env: config.env });
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
  private connection: ClientSideConnection | null = null;
  private transport: AcpTransport | null = null;
  private _transportConfig: TransportConfig | null = null;
  private _status: ConnectionStatus = 'disconnected';
  private _agentInfo: Implementation | null = null;
  private _capabilities: AgentCapabilities | null = null;
  private _clientInfo: Implementation | undefined = undefined;
  private _clientCapabilities: ClientCapabilities | undefined = undefined;

  private sessionUpdateHandlers = new Set<SessionUpdateHandler>();
  private permissionHandler: PermissionHandler | null = null;
  private fileReadHandler: FileReadHandler | null = null;
  private fileWriteHandler: FileWriteHandler | null = null;
  private terminalHandler: TerminalHandler | null = null;
  private terminalHandles = new Map<string, import('../types').TerminalHandle>();
  private extMethodHandler: ExtMethodHandler | null = null;
  private extNotificationHandler: ExtNotificationHandler | null = null;
  private statusHandlers = new Set<(status: ConnectionStatus) => void>();
  private closeHandlers = new Set<() => void>();

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

  setFileReadHandler(handler: FileReadHandler): void {
    this.fileReadHandler = handler;
  }

  setFileWriteHandler(handler: FileWriteHandler): void {
    this.fileWriteHandler = handler;
  }

  setTerminalHandler(handler: TerminalHandler): void {
    this.terminalHandler = handler;
  }

  setExtMethodHandler(handler: ExtMethodHandler): void {
    this.extMethodHandler = handler;
  }

  setExtNotificationHandler(handler: ExtNotificationHandler): void {
    this.extNotificationHandler = handler;
  }

  async connect(config: TransportConfig): Promise<void> {
    if (this._status === 'connecting') {
      return;
    }
    if (this.transport || this.connection) {
      this.disconnect();
    }
    this._transportConfig = config;
    this.transport = createTransport(config);
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

    const client: Client = {
      sessionUpdate: (params: SessionNotification) => {
        for (const h of this.sessionUpdateHandlers) h(params);
        return Promise.resolve();
      },
      requestPermission: (params: RequestPermissionRequest) => {
        if (this.permissionHandler) {
          return this.permissionHandler(params);
        }
        return Promise.resolve({
          outcome: { outcome: 'selected', optionId: params.options[0]?.optionId ?? '' },
        });
      },
      readTextFile: (params: ReadTextFileRequest) => {
        if (this.fileReadHandler) {
          return this.fileReadHandler(params);
        }
        return Promise.reject(new Error('readTextFile not supported'));
      },
      writeTextFile: (params: WriteTextFileRequest) => {
        if (this.fileWriteHandler) {
          return this.fileWriteHandler(params);
        }
        return Promise.reject(new Error('writeTextFile not supported'));
      },
      createTerminal: (params: CreateTerminalRequest) => {
        if (this.terminalHandler) {
          return this.terminalHandler.create(params).then((handle) => {
            this.terminalHandles.set(handle.terminalId, handle);
            return { terminalId: handle.terminalId };
          });
        }
        return Promise.reject(new Error('terminal not supported'));
      },
      terminalOutput: (params: TerminalOutputRequest) => {
        const handle = this.terminalHandles.get(params.terminalId);
        if (handle) {
          return handle.getOutput();
        }
        return Promise.reject(new Error(`terminal ${params.terminalId} not found`));
      },
      releaseTerminal: (params: ReleaseTerminalRequest) => {
        const handle = this.terminalHandles.get(params.terminalId);
        if (handle) {
          return handle.release().then(() => {
            this.terminalHandles.delete(params.terminalId);
            return {};
          });
        }
        return Promise.resolve({});
      },
      waitForTerminalExit: (params: WaitForTerminalExitRequest) => {
        const handle = this.terminalHandles.get(params.terminalId);
        if (handle) {
          return handle.waitForExit();
        }
        return Promise.reject(new Error(`terminal ${params.terminalId} not found`));
      },
      killTerminal: (params: KillTerminalRequest) => {
        const handle = this.terminalHandles.get(params.terminalId);
        if (handle) {
          return handle.kill().then(() => ({}));
        }
        return Promise.reject(new Error(`terminal ${params.terminalId} not found`));
      },
      extMethod: (method: string, params: Record<string, unknown>) => {
        if (this.extMethodHandler) {
          return this.extMethodHandler(method, params);
        }
        return Promise.reject(new Error(`extension method ${method} not supported`));
      },
      extNotification: (method: string, params: Record<string, unknown>) => {
        if (this.extNotificationHandler) {
          this.extNotificationHandler(method, params);
        }
        return Promise.resolve();
      },
    };

    this.connection = new ClientSideConnection(
      (_agent: Agent) => client,
      stream,
    );

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

  async initialize(clientInfo?: Implementation, clientCapabilities?: ClientCapabilities): Promise<InitializeResponse> {
    if (!this.connection) throw new Error('Not connected');

    this._clientInfo = clientInfo;
    this._clientCapabilities = clientCapabilities;

    const req: InitializeRequest = {
      protocolVersion: 1,
      clientInfo: clientInfo ?? null,
      clientCapabilities: clientCapabilities ?? undefined,
    };

    const res = await this.connection.initialize(req);
    this._agentInfo = res.agentInfo ?? null;
    this._capabilities = res.agentCapabilities ?? null;
    this.setStatus('connected');
    return res;
  }

  async newSession(cwd: string, mcpServers: NewSessionRequest['mcpServers'] = []): Promise<NewSessionResponse> {
    if (!this.connection) throw new Error('Not connected');
    return this.connection.newSession({ cwd, mcpServers });
  }

  async prompt(sessionId: string, prompt: PromptRequest['prompt']): Promise<PromptResponse> {
    if (!this.connection) throw new Error('Not connected');
    return this.connection.prompt({ sessionId, prompt });
  }

  async cancel(sessionId: string): Promise<void> {
    if (!this.connection) throw new Error('Not connected');
    const params: CancelNotification = { sessionId };
    await this.connection.cancel(params);
  }

  async listSessions(cursor?: string, cwd?: string): Promise<ListSessionsResponse> {
    if (!this.connection) throw new Error('Not connected');
    const params: ListSessionsRequest = {};
    if (cursor) params.cursor = cursor;
    if (cwd) params.cwd = cwd;
    return this.connection.listSessions(params);
  }

  async loadSession(sessionId: string, cwd: string, mcpServers: LoadSessionRequest['mcpServers'] = []): Promise<LoadSessionResponse> {
    if (!this.connection) throw new Error('Not connected');
    return this.connection.loadSession({ sessionId, cwd, mcpServers });
  }

  async setSessionConfigOption(sessionId: string, configId: string, value: string | boolean): Promise<SetSessionConfigOptionResponse> {
    if (!this.connection) throw new Error('Not connected');
    const params: SetSessionConfigOptionRequest = { sessionId, configId } as SetSessionConfigOptionRequest;
    if (typeof value === 'boolean') {
      (params as Record<string, unknown>).type = 'boolean';
      (params as Record<string, unknown>).value = value;
    } else {
      (params as Record<string, unknown>).value = value;
    }
    return this.connection.setSessionConfigOption(params);
  }

  async closeSession(sessionId: string): Promise<CloseSessionResponse> {
    if (!this.connection) throw new Error('Not connected');
    const params: CloseSessionRequest = { sessionId };
    return this.connection.closeSession(params);
  }

  async authenticate(methodId: string): Promise<AuthenticateResponse> {
    if (!this.connection) throw new Error('Not connected');
    const params: AuthenticateRequest = { methodId };
    return this.connection.authenticate(params);
  }

  async extMethod(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.connection) throw new Error('Not connected');
    return this.connection.extMethod(method, params);
  }

  async extNotification(method: string, params: Record<string, unknown>): Promise<void> {
    if (!this.connection) throw new Error('Not connected');
    return this.connection.extNotification(method, params);
  }

  disconnect(): void {
    for (const [, handle] of this.terminalHandles) {
      try { handle.release(); } catch { /* best effort */ }
    }
    this.terminalHandles.clear();

    this.transport?.disconnect();
    // connection.closed handler fires async → setStatus + closeHandlers + clear
    this.connection = null;
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
