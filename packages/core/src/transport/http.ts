import type { Stream, AnyMessage } from '@agentclientprotocol/sdk';
import type { AcpTransport } from './types';

interface HttpTransportOptions {
  url: string;
  headers?: Record<string, string>;
}

export class HttpTransport implements AcpTransport {
  private abortController: AbortController | null = null;
  private closeHandlers: Array<() => void> = [];
  private errorHandlers: Array<(err: Error) => void> = [];

  constructor(private options: HttpTransportOptions) {}

  async connect(): Promise<Stream> {
    this.abortController = new AbortController();
    const { url, headers } = this.options;

    const writable = new WritableStream<AnyMessage>({
      write: async (msg) => {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(msg),
            signal: this.abortController!.signal,
          });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }
        } catch (err) {
          if ((err as Error).name !== 'AbortError') {
            for (const h of this.errorHandlers) h(err as Error);
          }
        }
      },
    });

    const readable = new ReadableStream<AnyMessage>({
      start: () => {},
      cancel: () => {
        this.abortController?.abort();
      },
    });

    return { writable, readable };
  }

  disconnect(): void {
    this.abortController?.abort();
    for (const h of this.closeHandlers) h();
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
