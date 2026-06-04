import ReactDOM from 'react-dom/client';
import { useEffect, useRef } from 'react';
// @ts-expect-error Vite worker imports — types not available for ?worker suffix
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
// @ts-expect-error Vite worker imports
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
// @ts-expect-error Vite worker imports
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
// @ts-expect-error Vite worker imports
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
// @ts-expect-error Vite worker imports
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// Monaco requires MonacoEnvironment.getWorker to spawn language-specific web workers.
// Without this, Monaco falls back to running workers on the main thread (causing UI freezes)
// and fails on $loadForeignModule because FileAccessImpl.toUrl is unavailable outside a worker.
// @ts-expect-error Monaco global worker environment — typed by monaco-editor, not available here
self.MonacoEnvironment = {
  getWorker(_: string, label: string) {
    switch (label) {
      case 'json':
        return new jsonWorker();
      case 'css':
      case 'scss':
      case 'less':
        return new cssWorker();
      case 'html':
      case 'handlebars':
      case 'razor':
        return new htmlWorker();
      case 'typescript':
      case 'javascript':
        return new tsWorker();
      default:
        return new editorWorker();
    }
  },
};

import { AcpProvider } from '@acp-components/react';
import { Workbench } from '@acp-components/react';
import { SessionList } from '@acp-components/react';
import { ChatView } from '@acp-components/react';
import { PermissionDialog } from '@acp-components/react';
import { LoginDialog } from '@acp-components/react';
import { FileTree } from '@acp-components/react';
import { FileViewer } from '@acp-components/react';
import { SettingsMenu } from '@acp-components/react';
import { I18nProvider } from '@acp-components/react';
import { useAcpStore } from '@acp-components/react';
import { useAcpContext } from '@acp-components/react';
import { useFileTree } from '@acp-components/react';
import { useFileViewer } from '@acp-components/react';
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

async function serverReadFileContent(path: string): Promise<string> {
  const res = await fetch(`/api/readfile?path=${encodeURIComponent(path)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  const data = await res.json() as { content: string };
  return data.content;
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

// ---------------------------------------------------------------------------
// FileTreePanel — displays file tree for the active workspace
// ---------------------------------------------------------------------------

function FileTreePanel({ cwd, onNavigateFile }: { cwd: string; onNavigateFile?: (path: string, line?: number | null) => void }) {
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
      onNavigate={onNavigateFile}
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
  const fileViewer = useFileViewer();

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

  const hasOpenFiles = fileViewer.openFiles.length > 0;

  return (
    <>
      <Workbench
        sidebar={
          <>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <SessionList onBrowse={handleBrowse} />
            </div>
            <SettingsMenu />
          </>
        }
        main={
          <div style={{ display: 'flex', flexDirection: 'row', height: '100%' }}>

            <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
              <ChatView
                sessionId={activeSessionId}
                onNavigateFile={fileViewer.openFile}
              />
            </div>
            {activeCwd && (
              <div style={{ flex: '0 0 260px', overflow: 'hidden', borderLeft: '1px solid var(--acp-color-border-subtle)' }}>
                <FileTreePanel cwd={activeCwd} onNavigateFile={fileViewer.openFile} />
              </div>
            )}
          </div>
        }
        panel={hasOpenFiles ? (
          <FileViewer
            openFiles={fileViewer.openFiles}
            activeFile={fileViewer.activeFile}
            onCloseFile={fileViewer.closeFile}
            onSelectFile={fileViewer.setActiveFile}
            revealLine={fileViewer.revealLine}
            onRevealLineConsumed={fileViewer.clearRevealLine}
          />
        ) : undefined}
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
          onFileContentRead: serverReadFileContent,
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
