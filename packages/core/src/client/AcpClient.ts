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
  type SetSessionModeRequest,
  type CancelNotification,
  type ReadTextFileRequest,
  type ReadTextFileResponse,
  type WriteTextFileRequest,
  type WriteTextFileResponse,
  type ClientCapabilities,
} from '@agentclientprotocol/sdk';
import { StdioTransport, HttpTransport, WebSocketTransport } from '../transport';
import type { AcpTransport } from '../transport';
import type { ConnectionStatus, Implementation, TransportConfig } from '../types';

export type SessionUpdateHandler = (update: SessionNotification) => void;
export type PermissionHandler = (request: RequestPermissionRequest) => Promise<RequestPermissionResponse>;
export type FileReadHandler = (request: ReadTextFileRequest) => Promise<ReadTextFileResponse>;
export type FileWriteHandler = (request: WriteTextFileRequest) => Promise<WriteTextFileResponse>;

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
  private _status: ConnectionStatus = 'disconnected';
  private _agentInfo: Implementation | null = null;
  private _capabilities: Record<string, unknown> | null = null;

  private sessionUpdateHandlers = new Set<SessionUpdateHandler>();
  private permissionHandler: PermissionHandler | null = null;
  private fileReadHandler: FileReadHandler | null = null;
  private fileWriteHandler: FileWriteHandler | null = null;
  private statusHandlers = new Set<(status: ConnectionStatus) => void>();

  get status(): ConnectionStatus {
    return this._status;
  }

  get agentInfo(): Implementation | null {
    return this._agentInfo;
  }

  get capabilities(): Record<string, unknown> | null {
    return this._capabilities;
  }

  private setStatus(status: ConnectionStatus): void {
    this._status = status;
    for (const h of this.statusHandlers) h(status);
  }

  onStatusChange(handler: (status: ConnectionStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
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

  async connect(config: TransportConfig): Promise<void> {
    this.transport = createTransport(config);
    this.setStatus('connecting');

    const stream = await this.transport.connect();

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
    };

    this.connection = new ClientSideConnection(
      (_agent: Agent) => client,
      stream,
    );

    this.transport.onClose?.(() => {
      this.setStatus('disconnected');
    });

    this.transport.onError?.((_err) => {
      this.setStatus('error');
    });
  }

  async initialize(clientInfo?: Implementation, clientCapabilities?: ClientCapabilities): Promise<InitializeResponse> {
    if (!this.connection) throw new Error('Not connected');

    const req: InitializeRequest = {
      protocolVersion: 1,
      clientInfo: clientInfo ?? null,
      clientCapabilities: clientCapabilities ?? undefined,
    };

    const res = await this.connection.initialize(req);
    this._agentInfo = res.agentInfo ?? null;
    this._capabilities = res.agentCapabilities as Record<string, unknown> ?? null;
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

  async setSessionMode(sessionId: string, modeId: string): Promise<void> {
    if (!this.connection) throw new Error('Not connected');
    const params: SetSessionModeRequest = { sessionId, modeId };
    await this.connection.setSessionMode(params);
  }

  async setSessionModel(sessionId: string, modelId: string): Promise<void> {
    if (!this.connection) throw new Error('Not connected');
    const params = { sessionId, modelId };
    await this.connection.unstable_setSessionModel(params);
  }

  async closeSession(sessionId: string): Promise<void> {
    if (!this.connection) throw new Error('Not connected');
    await this.connection.cancel({ sessionId });
  }

  disconnect(): void {
    this.transport?.disconnect();
    this.connection = null;
    this.transport = null;
    this.setStatus('disconnected');
  }
}
