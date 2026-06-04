import ReactDOM from 'react-dom/client';
import { AcpProvider } from '@acp-components/react';
import { Workbench } from '@acp-components/react';
import { SessionList } from '@acp-components/react';
import { ChatView } from '@acp-components/react';
import { PermissionDialog } from '@acp-components/react';
import { LoginDialog } from '@acp-components/react';
import { I18nProvider } from '@acp-components/react';
import { SettingsMenu } from '@acp-components/react';
import { useAcpStore } from '@acp-components/react';
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
    command: 'opencode',
    args: ['acp'],
  }),
};

const terminalHandler = new TauriTerminalHandler();

function AppInner() {
  const activeSessionId = useAcpStore((s) => s.activeSessionId);

  const handleBrowse = async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    return (await open({ directory: true })) ?? null;
  };

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
        main={<ChatView sessionId={activeSessionId} />}
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
      >
        <AppInner />
      </AcpProvider>
    </I18nProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
