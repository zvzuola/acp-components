import type { Stream, AnyMessage } from '@agentclientprotocol/sdk';

export interface AcpTransport {
  connect(): Promise<Stream>;
  disconnect(): void;
  onClose?: (handler: () => void) => () => void;
  onError?: (handler: (err: Error) => void) => () => void;
}

export type { Stream, AnyMessage };
