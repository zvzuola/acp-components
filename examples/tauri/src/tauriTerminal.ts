import type {
  TerminalHandle,
  TerminalHandler,
  CreateTerminalRequest,
  TerminalOutputResponse,
  WaitForTerminalExitResponse,
  TerminalExitStatus,
} from '@acp-components/core';

type OutputPayload = { terminal_id: string; output: string };
type ExitPayload = { terminal_id: string; exit_code: number | null; signal: string | null };

class TauriTerminalHandle implements TerminalHandle {
  readonly terminalId: string;
  private output: string = '';
  private exitStatus: TerminalExitStatus | null = null;
  private outputListeners: Array<(output: string) => void> = [];
  private exitListeners: Array<(status: TerminalExitStatus | null) => void> = [];
  private _unlistenOutput: (() => void) | null = null;
  private _unlistenExit: (() => void) | null = null;

  constructor(terminalId: string) {
    this.terminalId = terminalId;
  }

  _setup(unlistenOutput: () => void, unlistenExit: () => void): void {
    this._unlistenOutput = unlistenOutput;
    this._unlistenExit = unlistenExit;
  }

  _appendOutput(text: string): void {
    this.output += text;
    for (const fn of this.outputListeners) fn(this.output);
  }

  _onExit(exitCode: number | null | undefined, signal: string | null | undefined): void {
    this.exitStatus = { exitCode: exitCode ?? null, signal: signal ?? null };
    for (const fn of this.exitListeners) fn(this.exitStatus);
  }

  async getOutput(): Promise<TerminalOutputResponse> {
    return { output: this.output, truncated: false, exitStatus: this.exitStatus };
  }

  async waitForExit(): Promise<WaitForTerminalExitResponse> {
    if (this.exitStatus) {
      return { exitCode: this.exitStatus.exitCode, signal: this.exitStatus.signal };
    }
    return new Promise((resolve) => {
      const unsub = this.onExit((status) => {
        unsub();
        resolve({ exitCode: status?.exitCode, signal: status?.signal });
      });
    });
  }

  async kill(): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('kill_terminal', { args: { terminal_id: this.terminalId } });
  }

  async release(): Promise<void> {
    this._unlistenOutput?.();
    this._unlistenExit?.();
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('release_terminal', { args: { terminal_id: this.terminalId } });
  }

  onOutputChange(fn: (output: string) => void): () => void {
    this.outputListeners.push(fn);
    return () => {
      this.outputListeners = this.outputListeners.filter((l) => l !== fn);
    };
  }

  onExit(fn: (status: TerminalExitStatus | null) => void): () => void {
    this.exitListeners.push(fn);
    return () => {
      this.exitListeners = this.exitListeners.filter((l) => l !== fn);
    };
  }
}

export class TauriTerminalHandler implements TerminalHandler {
  async create(params: CreateTerminalRequest): Promise<TerminalHandle> {
    const { invoke } = await import('@tauri-apps/api/core');
    const { listen } = await import('@tauri-apps/api/event');

    const terminalId: string = await invoke('create_terminal', {
      args: {
        command: params.command,
        args: params.args ?? [],
        cwd: params.cwd ?? null,
        env: params.env?.map((e: { name: string; value: string }) => ({ name: e.name, value: e.value })) ?? null,
      },
    });

    const handle = new TauriTerminalHandle(terminalId);

    const unlistenOutput = await listen<OutputPayload>('terminal-output', (event) => {
      if (event.payload.terminal_id === terminalId) {
        handle._appendOutput(event.payload.output);
      }
    });

    const unlistenExit = await listen<ExitPayload>('terminal-exit', (event) => {
      if (event.payload.terminal_id === terminalId) {
        handle._onExit(event.payload.exit_code, event.payload.signal);
      }
    });

    handle._setup(unlistenOutput, unlistenExit);

    return handle;
  }
}
