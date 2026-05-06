import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { WebSocket } from 'ws';

export interface BridgeOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export function createBridge(ws: WebSocket, options: BridgeOptions): () => void {
  const proc: ChildProcess = spawn(options.command, options.args ?? [], {
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...options.env },
  });

  const rl = createInterface({ input: proc.stdout!, crlfDelay: Infinity });

  rl.on('line', (line: string) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(line);
    }
  });

  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    proc.stdin?.end();
    proc.kill();
  };

  proc.on('error', (err) => {
    console.error(`[acp-server] failed to spawn agent: ${err.message}`);
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32000, message: `Failed to start agent: ${err.message}` },
      }));
      ws.close(1011, 'Agent spawn failed');
    }
  });

  proc.stderr?.on('data', (data: Buffer) => {
    process.stderr.write(`[agent stderr] ${data.toString()}`);
  });

  ws.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
    if (proc.stdin && !proc.stdin.destroyed) {
      let text: string;
      if (Buffer.isBuffer(raw)) {
        text = raw.toString();
      } else if (raw instanceof ArrayBuffer) {
        text = new TextDecoder().decode(raw);
      } else {
        text = Buffer.concat(raw).toString();
      }
      proc.stdin.write(text + '\n');
    }
  });

  ws.on('close', () => {
    console.log('[acp-server] client disconnected');
    cleanup()
  });

  ws.on('error', () => {
    console.error('[acp-server] WebSocket error');
    cleanup();
  });

  proc.on('exit', () => {
    if (ws.readyState === ws.OPEN) {
      ws.close();
    }
  });

  return () => {
    proc.stdin?.end();
    proc.kill();
  };
}
