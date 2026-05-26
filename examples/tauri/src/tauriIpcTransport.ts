import type { AcpTransport, Stream, AnyMessage } from '@acp-components/core';

interface TauriIpcOptions {
  agentId: string;
  command: string;
  args?: string[];
}

/** Event payload from Rust after multi-agent refactor. */
interface AgentEventPayload {
  agent_id: string;
  data?: string;
  message?: string;
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

  constructor(private options: TauriIpcOptions) {}

  async connect(): Promise<Stream> {
    const { invoke } = await import('@tauri-apps/api/core');
    const { listen } = await import('@tauri-apps/api/event');

    const textEncoder = new TextEncoder();
    const agentId = this.options.agentId;

    // Start the agent via Tauri command
    await invoke('start_agent', {
      args: {
        agent_id: agentId,
        command: this.options.command,
        args: this.options.args ?? [],
      },
    });

    // Build ReadableStream from Tauri events (message-level, like WebSocket transport)
    const readable = new ReadableStream<AnyMessage>({
      start: async (controller) => {
        const unlistenOutput = await listen<AgentEventPayload>('agent-output', (event) => {
          if (event.payload.agent_id !== agentId) return;
          try {
            const msg = JSON.parse(event.payload.data!) as AnyMessage;

            console.log(`[${agentId} stdout]`, msg);

            controller.enqueue(msg);
          } catch {
            // Skip non-JSON lines (e.g. agent startup logs)
          }
        });

        const unlistenStderr = await listen<AgentEventPayload>('agent-stderr', (event) => {
          if (event.payload.agent_id !== agentId) return;
          console.error(`[${agentId} stderr]`, event.payload.data);
        });

        const unlistenClosed = await listen<AgentEventPayload>('agent-closed', (event) => {
          if (event.payload.agent_id !== agentId) return;
          controller.close();
          for (const h of this.closeHandlers) h();
        });

        const unlistenError = await listen<AgentEventPayload>('agent-error', (event) => {
          if (event.payload.agent_id !== agentId) return;
          for (const h of this.errorHandlers) {
            h(new Error(event.payload.message ?? 'Unknown agent error'));
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
        console.log(`[${agentId} stdin]`, msg);
        const { invoke } = await import('@tauri-apps/api/core');
        const line = JSON.stringify(msg) + '\n';
        const data = Array.from(textEncoder.encode(line));
        await invoke('write_to_agent', {
          args: {
            agent_id: agentId,
            data,
          },
        });
      },
      close: async () => {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('kill_agent', {
          args: { agent_id: agentId },
        });
      },
    });

    return { readable, writable };
  }

  disconnect(): void {
    this.unlisten?.();
    this.unlisten = null;

    import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('kill_agent', {
        args: { agent_id: this.options.agentId },
      }))
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
