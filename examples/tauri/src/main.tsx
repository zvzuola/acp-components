import { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { AcpProvider } from '@acp-components/react';
import { Workbench } from '@acp-components/react';
import { ProjectOpener } from '@acp-components/react';
import { SessionList } from '@acp-components/react';
import { ChatView } from '@acp-components/react';
import { PermissionDialog } from '@acp-components/react';
import { ConnectionStatus } from '@acp-components/react';
import { useAcpStore, useSessions } from '@acp-components/core';
import { TauriIpcTransport } from './tauriIpcTransport';

// Tauri IPC transport: the Rust backend spawns the agent process and bridges
// stdin/stdout through Tauri commands and events. No WebSocket server needed.
//
// To customize the agent binary or arguments:
//   new TauriIpcTransport({ command: 'opencode', args: ['acp'] })

const transportConfig = {
  type: 'custom' as const,
  transport: new TauriIpcTransport({
    command: 'opencode',
    args: ['acp'],
  }),
};

function AppInner() {
  const activeSessionId = useAcpStore((s) => s.activeSessionId);
  const projectCwd = useAcpStore((s) => s.projectCwd);
  const { refreshSessions } = useSessions();
  const prevCwd = useRef(projectCwd);

  useEffect(() => {
    if (prevCwd.current !== projectCwd) {
      prevCwd.current = projectCwd;
      refreshSessions(projectCwd);
    }
  }, [projectCwd, refreshSessions]);

  const handleBrowse = async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    return (await open({ directory: true })) ?? null;
  };

  return (
    <>
      <Workbench
        sidebar={
          <>
            <ProjectOpener onBrowse={handleBrowse} />
            <SessionList />
          </>
        }
        main={
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <ConnectionStatus />
            <div style={{ flex: 1, minHeight: 0 }}>
              <ChatView sessionId={activeSessionId} />
            </div>
          </div>
        }
      />
      <PermissionDialog sessionId={activeSessionId} />
    </>
  );
}

function App() {
  return (
    <AcpProvider
      transport={transportConfig}
      theme="dark"
    >
      <AppInner />
    </AcpProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
