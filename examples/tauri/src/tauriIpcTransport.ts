import type { AcpTransport, Stream, AnyMessage } from '@acp-components/core';

interface TauriIpcOptions {
  command: string;
  args?: string[];
}

/**
 * An AcpTransport that bridges agent stdio through Tauri IPC commands.
 *
 * Instead of WebSocket or Node.js child_process, this transport uses
 * Tauri's invoke() / listen() to communicate with a Rust backend that
 * spawns the agent process and pipes its stdin/stdout.
 *
 * Data flow:
 *   Agent stdout ──> Rust (line-by-line) ──> Tauri event ──> ReadableStream
 *   Agent stdin  <── Rust (write) <── Tauri command <── WritableStream
 */
export class TauriIpcTransport implements AcpTransport {
  private closeHandlers: Array<() => void> = [];
  private errorHandlers: Array<(err: Error) => void> = [];
  private unlisten: (() => void) | null = null;
  private started = false;

  constructor(private options: TauriIpcOptions) {}

  async connect(): Promise<Stream> {
    const { invoke } = await import('@tauri-apps/api/core');
    const { listen } = await import('@tauri-apps/api/event');

    const textEncoder = new TextEncoder();

    // Start the agent via Tauri command
    await invoke('start_agent', {
      args: {
        command: this.options.command,
        args: this.options.args ?? [],
      },
    });
    this.started = true;

    // Build ReadableStream from Tauri events (message-level, like WebSocket transport)
    const readable = new ReadableStream<AnyMessage>({
      start: async (controller) => {
        const unlistenOutput = await listen<string>('agent-output', (event) => {
          try {
            const msg = JSON.parse(event.payload) as AnyMessage;
            controller.enqueue(msg);
          } catch {
            // Skip non-JSON lines (e.g. agent startup logs)
          }
        });

        const unlistenStderr = await listen<string>('agent-stderr', (event) => {
          console.error('[agent stderr]', event.payload);
        });

        const unlistenClosed = await listen('agent-closed', () => {
          controller.close();
          for (const h of this.closeHandlers) h();
        });

        const unlistenError = await listen<string>('agent-error', (event) => {
          for (const h of this.errorHandlers) {
            h(new Error(event.payload));
          }
        });

        this.unlisten = () => {
          unlistenOutput();
          unlistenStderr();
          unlistenClosed();
          unlistenError();
        };
      },
      cancel: () => {
        this.unlisten?.();
        this.unlisten = null;
      },
    });

    // Build WritableStream that sends JSON lines via Tauri invoke
    const writable = new WritableStream<AnyMessage>({
      write: async (msg) => {
        const { invoke } = await import('@tauri-apps/api/core');
        const line = JSON.stringify(msg) + '\n';
        const data = Array.from(textEncoder.encode(line));
        await invoke('write_to_agent', { data });
      },
      close: async () => {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('kill_agent');
      },
    });

    return { readable, writable };
  }

  disconnect(): void {
    this.unlisten?.();
    this.unlisten = null;
    this.started = false;

    import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('kill_agent'))
      .catch(() => {});
  }

  onClose(handler: () => void): () => void {
    this.closeHandlers.push(handler);
    return () => {
      this.closeHandlers = this.closeHandlers.filter((h) => h !== handler);
    };
  }

  onError(handler: (err: Error) => void): () => void {
    this.errorHandlers.push(handler);
    return () => {
      this.errorHandlers = this.errorHandlers.filter((h) => h !== handler);
    };
  }
}
