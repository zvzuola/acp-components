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
import { PlatformProvider } from '@acp-components/react';
import { useAcpStore } from '@acp-components/react';
import { useAcpContext } from '@acp-components/react';
import { useFileViewer } from '@acp-components/react';
import { usePlatform } from '@acp-components/react';
import { TauriIpcTransport } from './tauriIpcTransport';
import { createTauriPlatform } from './tauriPlatform';

// Tauri IPC transport: the Rust backend spawns the agent process and bridges
// stdin/stdout through Tauri commands and events. No WebSocket server needed.
//
// To customize the agent binary or arguments:
//   new TauriIpcTransport({ command: 'opencode', args: ['acp'] })

function AppInner() {
  const activeSessionId = useAcpStore((s) => s.activeSessionId);
  const workspaces = useAcpStore((s) => s.workspaces);
  const { addWorkspace } = useAcpContext();
  const platform = usePlatform();
  const fileViewer = useFileViewer();

  // -------------------------------------------------------------------------
  // Workspace persistence — cache opened workspaces so they are automatically
  // restored on the next app launch.
  // -------------------------------------------------------------------------

  const initialized = useRef(false);
  const lastSavedKeys = useRef<string>('');

  // Load cached workspaces on first mount
  useEffect(() => {
    platform.loadWorkspaces?.()
      .then((paths) => {
        if (paths.length > 0) {
          for (const cwd of paths) addWorkspace(cwd);
          lastSavedKeys.current = JSON.stringify(paths.slice().sort());
        } else {
          lastSavedKeys.current = '[]';
        }
      })
      .catch((e) => {
        console.error('[workspaces] Failed to load cached workspaces:', e);
        lastSavedKeys.current = '[]';
      })
      .finally(() => {
        initialized.current = true;
      });
  }, [platform, addWorkspace]);

  // Persist workspace changes after initialization
  useEffect(() => {
    if (!initialized.current) return;
    const keys = JSON.stringify(Array.from(workspaces.keys()).sort());
    if (keys === lastSavedKeys.current) return;
    lastSavedKeys.current = keys;
    platform.saveWorkspaces?.(Array.from(workspaces.keys())).catch((e) => {
      console.error('[workspaces] Failed to save workspaces:', e);
    });
  }, [platform, workspaces]);

  const hasOpenFiles = fileViewer.openFiles.length > 0;

  return (
    <>
      <Workbench
        sidebar={
          <Sidebar
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

/**
 * Assemble AcpProvider with the platform-derived agent transport. Lives inside
 * PlatformProvider so it can pull `platform` via usePlatform(). The AcpProvider
 * itself does NOT receive a Platform object — agent data layer and native
 * capabilities are kept orthogonal per the design (§3.4).
 */
function AcpAssembly() {
  return (
    <AcpProvider
      agents={[{
        id: 'default',
        name: 'OpenCode',
        transport: {
          type: 'custom',
          transport: new TauriIpcTransport({
            agentId: 'default',
            command: 'npx',
            args: ['opencode-ai@latest', 'acp'],
          }),
        },
      }]}
      theme="dark"
      onExtMethod={async (method, params) => {
        console.log(`[ext-method] agent → client: ${method}`, params);
        throw new Error(`Unknown extension method: ${method}`);
      }}
      onExtNotification={(method, params) => {
        console.log(`[ext-notification] agent → client: ${method}`, params);
      }}
    >
      <AppInner />
    </AcpProvider>
  );
}

function App() {
  return (
    <PlatformProvider platform={createTauriPlatform()}>
      <I18nProvider>
        <AcpAssembly />
      </I18nProvider>
    </PlatformProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
