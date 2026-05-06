import { ndJsonStream } from '@agentclientprotocol/sdk';
import type { Stream } from '@agentclientprotocol/sdk';
import type { AcpTransport } from './types';

interface StdioTransportOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export class StdioTransport implements AcpTransport {
  private process: ReturnType<typeof import('node:child_process').spawn> | null = null;
  private closeHandlers: Array<() => void> = [];
  private errorHandlers: Array<(err: Error) => void> = [];

  constructor(private options: StdioTransportOptions) {}

  async connect(): Promise<Stream> {
    const { spawn } = await import('node:child_process');

    this.process = spawn(this.options.command, this.options.args ?? [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this.options.env },
    });

    this.process.on('error', (err) => {
      for (const h of this.errorHandlers) h(err);
    });

    this.process.on('close', () => {
      for (const h of this.closeHandlers) h();
    });

    const inputStream = this.process.stdin!;
    const outputStream = this.process.stdout!;

    const writable = new WritableStream<Uint8Array>({
      write: (chunk) => {
        inputStream.write(chunk);
      },
      close: () => {
        inputStream.end();
      },
    });

    const readable = new ReadableStream<Uint8Array>({
      start: (controller) => {
        outputStream.on('data', (chunk: Uint8Array) => {
          controller.enqueue(chunk);
        });
        outputStream.on('end', () => controller.close());
        outputStream.on('error', (err) => controller.error(err));
      },
      cancel: () => {
        outputStream.destroy();
      },
    });

    return ndJsonStream(writable, readable);
  }

  disconnect(): void {
    this.process?.kill();
    this.process = null;
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
