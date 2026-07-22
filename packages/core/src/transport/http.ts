import type { Stream, AnyMessage } from '@agentclientprotocol/sdk';
import { createHttpStream } from '@agentclientprotocol/sdk/experimental/http-client';
import type { AcpTransport } from './types';

interface HttpTransportOptions {
  url: string;
  headers?: Record<string, string>;
}

export class HttpTransport implements AcpTransport {
  private reader: ReadableStreamDefaultReader<AnyMessage> | null = null;
  private closeHandlers: Array<() => void> = [];
  private errorHandlers: Array<(err: Error) => void> = [];
  private disconnecting = false;

  constructor(private options: HttpTransportOptions) {}

  async connect(): Promise<Stream> {
    this.disconnecting = false;
    const { url, headers } = this.options;

    // The SDK's HttpStreamTransport implements the full Streamable HTTP
    // contract: POST for outgoing JSON-RPC, SSE GET for incoming messages,
    // Acp-Connection-Id lifecycle, session routing, cookie affinity, and
    // clean teardown on cancel/close.
    const inner = createHttpStream(url, {
      headers,
      cookies: 'include',
    });

    // Wrap the inner readable so we can surface close/error to the
    // onClose/onError lifecycle callbacks. The SDK's app.connect(stream)
    // reads from this wrapper; we pump messages from the inner readable and
    // detect when it ends or errors.
    const readable = new ReadableStream<AnyMessage>({
      start: (controller) => {
        this.reader = inner.readable.getReader();

        const pump = (): void => {
          this.reader!.read().then(
            ({ done, value }) => {
              if (done) {
                controller.close();
                for (const h of this.closeHandlers) h();
                return;
              }
              controller.enqueue(value);
              pump();
            },
            (err: Error) => {
              if (!this.disconnecting) {
                for (const h of this.errorHandlers) h(err);
              }
              try {
                controller.error(err);
              } catch {
                // already closed or cancelled
              }
              for (const h of this.closeHandlers) h();
            },
          );
        };
        pump();
      },
      cancel: () => {
        // Consumer cancelled the wrapper — forward to the inner readable,
        // which drives the SDK's close().
        this.reader?.cancel().catch(() => {});
      },
    });

    return { writable: inner.writable, readable };
  }

  disconnect(): void {
    this.disconnecting = true;
    // Cancelling the reader triggers the SDK's close(): aborts in-flight
    // requests, DELETEs the connection, and closes the readable. The pump
    // then detects the close and fires onClose handlers.
    this.reader?.cancel().catch(() => {});
    this.reader = null;
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
