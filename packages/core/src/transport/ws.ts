import type { Stream, AnyMessage } from '@agentclientprotocol/sdk';
import type { AcpTransport } from './types';

interface WsTransportOptions {
  url: string;
}

export class WebSocketTransport implements AcpTransport {
  private ws: WebSocket | null = null;
  private closeHandlers: Array<() => void> = [];
  private errorHandlers: Array<(err: Error) => void> = [];

  constructor(private options: WsTransportOptions) {}

  async connect(): Promise<Stream> {
    const ws = new WebSocket(this.options.url);
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('WebSocket connection failed'));
    });

    const writable = new WritableStream<AnyMessage>({
      write: (msg) => {
        ws.send(JSON.stringify(msg));
      },
    });

    const readable = new ReadableStream<AnyMessage>({
      start: (controller) => {
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string) as AnyMessage;
            controller.enqueue(msg);
          } catch (err) {
            controller.error(err);
          }
        };
        ws.onerror = () => {
          for (const h of this.errorHandlers) h(new Error('WebSocket error'));
        };
        ws.onclose = () => {
          controller.close();
          for (const h of this.closeHandlers) h();
        };
      },
      cancel: () => {
        ws.close();
      },
    });

    return { writable, readable };
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
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
