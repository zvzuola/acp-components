import { WebSocketServer } from 'ws';
import { createBridge } from './bridge.js';

const PORT = parseInt(process.env.ACP_PORT ?? '3100', 10);
const HOST = process.env.ACP_HOST ?? '127.0.0.1';
const AGENT_COMMAND = process.env.ACP_AGENT ?? 'opencode';
const AGENT_ARGS = (process.env.ACP_AGENT_ARGS ?? 'acp').split(' ').filter(Boolean);

const wss = new WebSocketServer({ host: HOST, port: PORT });

wss.on('listening', () => {
  console.log(`[acp-server] listening on ws://${HOST}:${PORT}`);
  console.log(`[acp-server] agent: ${AGENT_COMMAND} ${AGENT_ARGS.join(' ')}`);
});

wss.on('connection', (ws, req) => {
  const remote = req.socket?.remoteAddress ?? 'unknown';
  console.log(`[acp-server] client connected: ${remote}`);

  const cleanup = createBridge(ws, {
    command: AGENT_COMMAND,
    args: AGENT_ARGS,
  });

  ws.on('close', () => {
    console.log(`[acp-server] client disconnected: ${remote}`);
    cleanup();
  });
});

process.on('SIGINT', () => {
  console.log('\n[acp-server] shutting down...');
  wss.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  wss.close();
  process.exit(0);
});
