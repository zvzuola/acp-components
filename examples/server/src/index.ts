import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { createBridge } from './bridge.js';
import { readDirectory, watchWorkspace, readFileContent } from './fileSystem.js';

const PORT = parseInt(process.env.ACP_PORT ?? '3100', 10);
const HOST = process.env.ACP_HOST ?? '127.0.0.1';
const AGENT_COMMAND = process.env.ACP_AGENT ?? 'npx';
const AGENT_ARGS = (process.env.ACP_AGENT_ARGS ?? 'opencode-ai@latest acp').split(' ').filter(Boolean);

// ---------------------------------------------------------------------------
// HTTP Server — serves file system API endpoints
// ---------------------------------------------------------------------------

// SSE connections for file change notifications
const sseClients = new Set<import('node:http').ServerResponse>();

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

  // CORS headers for dev convenience
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // GET /api/readdir?path=/some/path
  if (url.pathname === '/api/readdir' && req.method === 'GET') {
    const dirPath = url.searchParams.get('path');
    if (!dirPath) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing path parameter' }));
      return;
    }
    try {
      const nodes = await readDirectory(dirPath);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(nodes));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: err instanceof Error ? err.message : 'Failed to read directory',
      }));
    }
    return;
  }

  // GET /api/watch?cwd=/some/path — SSE stream for file change events
  if (url.pathname === '/api/watch' && req.method === 'GET') {
    const cwd = url.searchParams.get('cwd');
    if (!cwd) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing cwd parameter' }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Register this SSE client
    sseClients.add(res);
    req.on('close', () => {
      sseClients.delete(res);
    });

    // Start watching the workspace
    const unwatch = watchWorkspace({
      cwd,
      onChange: (dirPath) => {
        const data = JSON.stringify({ type: 'directory', cwd, path: dirPath });
        // Send to all connected SSE clients
        for (const client of sseClients) {
          client.write(`data: ${data}\n\n`);
        }
      },
    });

    req.on('close', () => {
      unwatch();
    });
    return;
  }

  // GET /api/readfile?path=/some/file
  if (url.pathname === '/api/readfile' && req.method === 'GET') {
    const filePath = url.searchParams.get('path');
    if (!filePath) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing path parameter' }));
      return;
    }
    try {
      const content = await readFileContent(filePath);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ content }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: err instanceof Error ? err.message : 'Failed to read file',
      }));
    }
    return;
  }

  // Fallback
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// ---------------------------------------------------------------------------
// WebSocket Server — attached to the same HTTP server
// ---------------------------------------------------------------------------

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  const remote = req.socket?.remoteAddress ?? 'unknown';
  console.log(`[acp-server] ws client connected: ${remote}`);

  const cleanup = createBridge(ws, {
    command: AGENT_COMMAND,
    args: AGENT_ARGS,
  });

  ws.on('close', () => {
    console.log(`[acp-server] ws client disconnected: ${remote}`);
    cleanup();
  });
});

httpServer.listen(PORT, HOST, () => {
  console.log(`[acp-server] HTTP + WS listening on http://${HOST}:${PORT}`);
  console.log(`[acp-server] agent: ${AGENT_COMMAND} ${AGENT_ARGS.join(' ')}`);
  console.log(`[acp-server] API: GET /api/readdir?path=... | GET /api/watch?cwd=...`);
});

process.on('SIGINT', () => {
  console.log('\n[acp-server] shutting down...');
  wss.close();
  httpServer.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  wss.close();
  httpServer.close();
  process.exit(0);
});
