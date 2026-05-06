import ReactDOM from 'react-dom/client';
import { AcpProvider } from '@acp-components/react';
import { Workbench } from '@acp-components/react';
import { SessionList } from '@acp-components/react';
import { ChatView } from '@acp-components/react';
import { PermissionDialog } from '@acp-components/react';
import { ConnectionStatus } from '@acp-components/react';
import { useAcpStore } from '@acp-components/core';
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

function App() {
  const activeSessionId = useAcpStore((s) => s.activeSessionId);

  return (
    <AcpProvider
      transport={transportConfig}
      theme="dark"
    >
      <Workbench
        sidebar={<SessionList />}
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
    </AcpProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
