import { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { AcpProvider } from '@acp-components/react';
import { Workbench } from '@acp-components/react';
import { Sidebar } from '@acp-components/react';
import { ChatView } from '@acp-components/react';
import { FileViewer } from '@acp-components/react';
import { PermissionDialog } from '@acp-components/react';
import { LoginDialog } from '@acp-components/react';
import { I18nProvider } from '@acp-components/react';
import { useAcpStore } from '@acp-components/react';
import { useFileViewer } from '@acp-components/react';
import type { FileTreeNode } from '@acp-components/react';
import { TauriIpcTransport } from './tauriIpcTransport';
import { TauriTerminalHandler } from './tauriTerminal';

// Tauri IPC transport: the Rust backend spawns the agent process and bridges
// stdin/stdout through Tauri commands and events. No WebSocket server needed.
//
// To customize the agent binary or arguments:
//   new TauriIpcTransport({ command: 'opencode', args: ['acp'] })

const transportConfig = {
  type: 'custom' as const,
  transport: new TauriIpcTransport({
    agentId: 'default',
    command: 'npx',
    args: ['opencode-ai@latest', 'acp'],
  }),
};

const terminalHandler = new TauriTerminalHandler();

// ---------------------------------------------------------------------------
// Tauri native file system — backs the sidebar file tree and file viewer
// ---------------------------------------------------------------------------

async function tauriReadDirectory(path: string): Promise<FileTreeNode[]> {
  const { readDir } = await import('@tauri-apps/plugin-fs');
  const entries = await readDir(path);
  const base = path.replace(/\\/g, '/').replace(/\/+$/, '');
  return entries.map((entry) => ({
    name: entry.name,
    path: `${base}/${entry.name}`,
    kind: (entry.isDirectory ? 'directory' : 'file') as 'directory' | 'file',
  }));
}

async function tauriReadFileContent(path: string): Promise<string> {
  const { readTextFile } = await import('@tauri-apps/plugin-fs');
  return await readTextFile(path);
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function AppInner() {
  const activeSessionId = useAcpStore((s) => s.activeSessionId);
  const workspaces = useAcpStore((s) => s.workspaces);
  const addWorkspace = useAcpStore((s) => s.addWorkspace);
  const fileViewer = useFileViewer();

  // -------------------------------------------------------------------------
  // Workspace persistence — cache opened workspaces so they are automatically
  // restored on the next app launch.
  // -------------------------------------------------------------------------

  const initialized = useRef(false);
  const lastSavedKeys = useRef<string>('');

  // Load cached workspaces on first mount
  useEffect(() => {
    (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const result = await invoke<{ workspaces: string[] }>('load_workspaces');
        if (result.workspaces.length > 0) {
          for (const cwd of result.workspaces) {
            addWorkspace(cwd);
          }
          lastSavedKeys.current = JSON.stringify(result.workspaces.slice().sort());
        } else {
          lastSavedKeys.current = '[]';
        }
      } catch (e) {
        console.error('[workspaces] Failed to load cached workspaces:', e);
        lastSavedKeys.current = '[]';
      }
      initialized.current = true;
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist workspace changes after initialization
  useEffect(() => {
    if (!initialized.current) return;
    const keys = JSON.stringify(Array.from(workspaces.keys()).sort());
    if (keys === lastSavedKeys.current) return;
    lastSavedKeys.current = keys;
    (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('save_workspaces', {
          args: { workspaces: Array.from(workspaces.keys()) },
        });
      } catch (e) {
        console.error('[workspaces] Failed to save workspaces:', e);
      }
    })();
  }, [workspaces]);

  const handleBrowse = async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    return (await open({ directory: true })) ?? null;
  };

  const hasOpenFiles = fileViewer.openFiles.length > 0;

  return (
    <>
      <Workbench
        sidebar={
          <Sidebar
            onBrowse={handleBrowse}
            onNavigateFile={fileViewer.openFile}
          />
        }
        main={
          <ChatView
            sessionId={activeSessionId}
            onNavigateFile={fileViewer.openFile}
          />
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
          id: 'default',
          name: 'OpenCode',
          transport: transportConfig,
        }]}
        theme="dark"
        onTerminal={terminalHandler}
        onExtMethod={async (method, params) => {
          console.log(`[ext-method] agent → client: ${method}`, params);
          throw new Error(`Unknown extension method: ${method}`);
        }}
        onExtNotification={(method, params) => {
          console.log(`[ext-notification] agent → client: ${method}`, params);
        }}
        fileSystem={{
          onDirectoryRead: tauriReadDirectory,
          onFileContentRead: tauriReadFileContent,
        }}
      >
        <AppInner />
      </AcpProvider>
    </I18nProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
