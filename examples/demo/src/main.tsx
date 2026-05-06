import ReactDOM from 'react-dom/client';
import { AcpProvider } from '@acp-components/react';
import { Workbench } from '@acp-components/react';
import { SessionList } from '@acp-components/react';
import { ChatView } from '@acp-components/react';
import { PermissionDialog } from '@acp-components/react';
import { useAcpStore } from '@acp-components/core';

// In web environments, stdio transport is unavailable (can't spawn child processes).
// Use WebSocket transport connected to the acp-server backend, which bridges
// the agent's stdio to WebSocket.
//
//   cd examples/server && pnpm dev
//
// For local Electron/Tauri/desktop where stdio works, switch back to:
//   transport: { type: 'stdio', command: 'opencode', args: ['acp'] }

function App() {
  const activeSessionId = useAcpStore((s) => s.activeSessionId);

  return (
    <AcpProvider
      transport={{
        type: 'websocket',
        url: 'ws://127.0.0.1:3100',
      }}
      theme="dark"
    >
      <Workbench
        sidebar={<SessionList />}
        main={<ChatView sessionId={activeSessionId} />}
      />
      <PermissionDialog sessionId={activeSessionId} />
    </AcpProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
