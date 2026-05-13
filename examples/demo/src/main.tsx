import { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { AcpProvider } from '@acp-components/react';
import { Workbench } from '@acp-components/react';
import { ProjectOpener } from '@acp-components/react';
import { SessionList } from '@acp-components/react';
import { ChatView } from '@acp-components/react';
import { PermissionDialog } from '@acp-components/react';
import { useAcpStore, useSessions } from '@acp-components/react';

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
    // In a browser, we can't get the real filesystem path from showDirectoryPicker.
    // Desktop environments (Tauri/Electron) should use their native dialog APIs instead.
    const path = window.prompt('Enter project directory path:', projectCwd || '/path/to/project');
    return path?.trim() || null;
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
        main={<ChatView sessionId={activeSessionId} />}
      />
      <PermissionDialog sessionId={activeSessionId} />
    </>
  );
}

function App() {
  return (
    <AcpProvider
      transport={{
        type: 'websocket',
        url: 'ws://127.0.0.1:3100',
      }}
      theme="dark"
    >
      <AppInner />
    </AcpProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
