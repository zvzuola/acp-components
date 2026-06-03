import ReactDOM from 'react-dom/client';
import { useEffect, useRef } from 'react';
import { AcpProvider } from '@acp-components/react';
import { Workbench } from '@acp-components/react';
import { SessionList } from '@acp-components/react';
import { ChatView } from '@acp-components/react';
import { PermissionDialog } from '@acp-components/react';
import { LoginDialog } from '@acp-components/react';
import { FileTree } from '@acp-components/react';
import { I18nProvider, useI18n } from '@acp-components/react';
import { useAcpStore } from '@acp-components/react';
import { useAcpContext } from '@acp-components/react';
import { useFileTree } from '@acp-components/react';
import type { FileTreeNode, FileTreeWatchCallbacks } from '@acp-components/react';

// ---------------------------------------------------------------------------
// Workspace cache — persists workspace paths to localStorage
// ---------------------------------------------------------------------------

const WORKSPACE_CACHE_KEY = 'acp-demo-workspaces';

function getCachedWorkspaces(): string[] {
  try {
    const raw = localStorage.getItem(WORKSPACE_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCachedWorkspaces(paths: string[]): void {
  localStorage.setItem(WORKSPACE_CACHE_KEY, JSON.stringify(paths));
}

// ---------------------------------------------------------------------------
// Server-backed file system API
// The bridge server (examples/server) exposes:
//   GET /api/readdir?path=...       → FileTreeNode[]
//   GET /api/watch?cwd=...          → SSE stream of file change events
// Vite dev proxy forwards /api/* → http://127.0.0.1:3100
// ---------------------------------------------------------------------------

async function serverReadDirectory(path: string): Promise<FileTreeNode[]> {
  const res = await fetch(`/api/readdir?path=${encodeURIComponent(path)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

function createServerFileWatcher(callbacks: FileTreeWatchCallbacks): () => void {
  const controllers = new Map<string, AbortController>();

  return (function makeWatcher() {
    // Watch is started per-workspace via the returned subscribe function below.
    // We return a cleanup that aborts all active SSE connections.
    const cleanup = () => {
      for (const ctrl of controllers.values()) ctrl.abort();
      controllers.clear();
    };

    // Expose subscribe on the cleanup function so the provider can call it
    (cleanup as unknown as { subscribe: (cwd: string) => void }).subscribe = (cwd: string) => {
      if (controllers.has(cwd)) return; // already watching
      const ctrl = new AbortController();
      controllers.set(cwd, ctrl);

      const url = `/api/watch?cwd=${encodeURIComponent(cwd)}`;
      const es = new EventSource(url);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as { type: string; cwd: string; path: string };
          if (data.type === 'directory') {
            callbacks.onDirectoryChanged(data.cwd, data.path);
          } else {
            callbacks.onWorkspaceChanged(data.cwd);
          }
        } catch {
          // ignore malformed SSE events
        }
      };

      es.onerror = () => {
        // EventSource auto-reconnects; on hard failure the browser logs it
        es.close();
        controllers.delete(cwd);
      };

      ctrl.signal.addEventListener('abort', () => es.close());
    };

    return cleanup;
  })();
}

function LocaleSwitcher() {
  const { i18n } = useI18n();
  const current = i18n.language?.startsWith('zh') ? 'zh-CN' : 'en-US';

  return (
    <div style={{ display: 'flex', gap: 4, padding: '8px 12px' }}>
      <button
        onClick={() => i18n.changeLanguage('en-US')}
        style={{
          flex: 1,
          padding: '4px 0',
          border: '1px solid var(--acp-color-border)',
          borderRadius: 4,
          background: current === 'en-US' ? 'var(--acp-color-accent)' : 'transparent',
          color: current === 'en-US' ? 'var(--acp-color-text-inverse)' : 'var(--acp-color-text-muted)',
          cursor: 'pointer',
          fontSize: 12,
        }}
      >
        EN
      </button>
      <button
        onClick={() => i18n.changeLanguage('zh-CN')}
        style={{
          flex: 1,
          padding: '4px 0',
          border: '1px solid var(--acp-color-border)',
          borderRadius: 4,
          background: current === 'zh-CN' ? 'var(--acp-color-accent)' : 'transparent',
          color: current === 'zh-CN' ? 'var(--acp-color-text-inverse)' : 'var(--acp-color-text-muted)',
          cursor: 'pointer',
          fontSize: 12,
        }}
      >
        中文
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FileTreePanel — displays file tree for the active workspace
// ---------------------------------------------------------------------------

function FileTreePanel({ cwd }: { cwd: string }) {
  const { files, loading, error, onExpand, onCollapse } = useFileTree({ cwd });

  if (error) {
    return (
      <div style={{ padding: 12, color: 'var(--acp-color-error)' }}>
        Error: {error}
      </div>
    );
  }

  if (loading && files.length === 0) {
    return (
      <div style={{ padding: 12, color: 'var(--acp-color-text-muted)' }}>
        Loading...
      </div>
    );
  }

  return (
    <FileTree
      files={files}
      onExpand={onExpand}
      onCollapse={onCollapse}
      onNavigate={(path) => console.log('Navigate to:', path)}
    />
  );
}

// In web environments, stdio transport is unavailable (can't spawn child processes).
// Use WebSocket transport connected to the acp-server backend, which bridges
// the agent's stdio to WebSocket.
//
//   cd examples/server && pnpm dev
//
// For local Electron/Tauri/desktop where stdio works, switch back to:
//   transport: { type: 'stdio', command: 'opencode', args: ['acp'] }

function AppInner() {
  const activeSessionId = useAcpStore((s) => s.activeSessionId);
  const workspaces = useAcpStore((s) => s.workspaces);
  const activeCwd = useAcpStore((s) => {
    if (!s.activeSessionId) return null;
    for (const [cwd, ws] of s.workspaces) {
      if (ws.sessions.has(s.activeSessionId)) return cwd;
    }
    return null;
  });
  const { addWorkspace } = useAcpContext();
  const loadedRef = useRef(false);

  // Load cached workspaces on mount (once)
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    for (const cwd of getCachedWorkspaces()) {
      addWorkspace(cwd);
    }
  }, [addWorkspace]);

  // Sync workspace changes to cache
  useEffect(() => {
    saveCachedWorkspaces(Array.from(workspaces.keys()));
  }, [workspaces]);

  const handleBrowse = async () => {
    const path = window.prompt('Enter project directory path:', '');
    return path?.trim() || null;
  };

  return (
    <>
      <Workbench
        sidebar={
          <>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <SessionList onBrowse={handleBrowse} />
            </div>
            <LocaleSwitcher />
          </>
        }
        main={
          <div style={{ display: 'flex', flexDirection: 'row', height: '100%' }}>

            <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
              <ChatView sessionId={activeSessionId} />
            </div>
            {activeCwd && (
              <div style={{ flex: '0 0 260px', overflow: 'hidden', borderLeft: '1px solid var(--acp-color-border-subtle)' }}>
                <FileTreePanel cwd={activeCwd} />
              </div>
            )}
          </div>
        }
      />
      <PermissionDialog sessionId={activeSessionId} />
      <LoginDialog />
    </>
  );
}

function App() {
  return (
    <I18nProvider>
      <AcpProvider
        agents={[{
          id: 'opencode',
          name: 'OpenCode',
          transport: {
            type: 'websocket',
            url: 'ws://127.0.0.1:3100',
          },
        }
        ]}
        theme="dark"
        onExtMethod={async (method, params) => {
          console.log(`[ext-method] agent → client: ${method}`, params);
          throw new Error(`Unknown extension method: ${method}`);
        }}
        onExtNotification={(method, params) => {
          console.log(`[ext-notification] agent → client: ${method}`, params);
        }}
        fileSystem={{
          onDirectoryRead: serverReadDirectory,
          onFileTreeWatch: ({ onDirectoryChanged, onWorkspaceChanged }) => {
            return createServerFileWatcher({ onDirectoryChanged, onWorkspaceChanged });
          },
        }}
      >
        <AppInner />
      </AcpProvider>
    </I18nProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
