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
import { useFileViewer } from '@acp-components/react';
import { TauriIpcTransport } from './tauriIpcTransport';
import { createTauriPlatform } from './tauriPlatform';

// Tauri IPC transport: the Rust backend spawns the agent process and bridges
// stdin/stdout through Tauri commands and events. No WebSocket server needed.
//
// To customize the agent binary or arguments:
//   new TauriIpcTransport({ command: 'opencode', args: ['acp'] })

function AppInner() {
  const activeSessionId = useAcpStore((s) => s.activeSessionId);
  // Show the panel only when at least one file is open. File-open state lives
  // in the global fileViewer store, wired automatically by <PlatformProvider>.
  // Workspace load/save is driven automatically by <PlatformWorkspacesAuto>
  // (mounted inside <PlatformProvider>).
  const { openFiles } = useFileViewer();

  return (
    <>
      <Workbench
        sidebar={<Sidebar />}
        main={<ChatView sessionId={activeSessionId} />}
        panel={openFiles.length > 0 ? <FileViewer /> : undefined}
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
