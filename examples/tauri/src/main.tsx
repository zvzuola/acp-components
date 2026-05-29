import ReactDOM from 'react-dom/client';
import { AcpProvider } from '@acp-components/react';
import { Workbench } from '@acp-components/react';
import { ProjectOpener } from '@acp-components/react';
import { SessionList } from '@acp-components/react';
import { ChatView } from '@acp-components/react';
import { PermissionDialog } from '@acp-components/react';
import { LoginDialog } from '@acp-components/react';
import { I18nProvider, useI18n } from '@acp-components/react';
import { useAcpStore } from '@acp-components/react';
import { TauriIpcTransport } from './tauriIpcTransport';
import { TauriTerminalHandler } from './tauriTerminal';

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
  const activeSessionId = useAcpStore((s) =>
    s.activeWorkspaceCwd ? s.workspaces.get(s.activeWorkspaceCwd)?.activeSessionId ?? null : null,
  );

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
            <div style={{ flex: 1, overflow: "hidden" }}>
              <SessionList />
            </div>
            <LocaleSwitcher />
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
