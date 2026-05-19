import ReactDOM from 'react-dom/client';
import { AcpProvider } from '@acp-components/react';
import { Workbench } from '@acp-components/react';
import { ProjectOpener } from '@acp-components/react';
import { SessionList } from '@acp-components/react';
import { ChatView } from '@acp-components/react';
import { PermissionDialog } from '@acp-components/react';
import { I18nProvider, useI18n } from '@acp-components/react';
import { useAcpStore } from '@acp-components/react';

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

// In web environments, stdio transport is unavailable (can't spawn child processes).
// Use WebSocket transport connected to the acp-server backend, which bridges
// the agent's stdio to WebSocket.
//
//   cd examples/server && pnpm dev
//
// For local Electron/Tauri/desktop where stdio works, switch back to:
//   transport: { type: 'stdio', command: 'opencode', args: ['acp'] }

function AppInner() {
  const activeSessionId = useAcpStore((s) =>
    s.activeWorkspaceCwd ? s.workspaces.get(s.activeWorkspaceCwd)?.activeSessionId ?? null : null,
  );
  const activeWorkspaceCwd = useAcpStore((s) => s.activeWorkspaceCwd);

  const handleBrowse = async () => {
    const path = window.prompt('Enter project directory path:', activeWorkspaceCwd || '/path/to/project');
    return path?.trim() || null;
  };

  return (
    <>
      <Workbench
        sidebar={
          <>
            <ProjectOpener onBrowse={handleBrowse} />
            <SessionList />
            <LocaleSwitcher />
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
      >
        <AppInner />
      </AcpProvider>
    </I18nProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
