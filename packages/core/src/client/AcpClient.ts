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
} from '@agentclientprotocol/sdk';
import { StdioTransport, HttpTransport, WebSocketTransport } from '../transport';
import type { AcpTransport } from '../transport';
import type { ConnectionStatus, Implementation, TransportConfig, TerminalHandler } from '../types';

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
  private terminalHandler: TerminalHandler | null = null;
  private terminalHandles = new Map<string, import('../types').TerminalHandle>();
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

  setTerminalHandler(handler: TerminalHandler): void {
    this.terminalHandler = handler;
  }

  async connect(config: TransportConfig): Promise<void> {
    if (this._status === 'connecting') {
      return;
    }
    if (this.transport || this.connection) {
      this.disconnect();
    }
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

  async closeSession(sessionId: string): Promise<void> {
    if (!this.connection) throw new Error('Not connected');
    await this.connection.cancel({ sessionId });
  }

  disconnect(): void {
    for (const [, handle] of this.terminalHandles) {
      try { handle.release(); } catch { /* best effort */ }
    }
    this.terminalHandles.clear();
    this.transport?.disconnect();
    this.connection = null;
    this.transport = null;
    this.setStatus('disconnected');
  }
}
