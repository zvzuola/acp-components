import { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { AcpProvider } from '@acp-components/react';
import { Workbench } from '@acp-components/react';
import { ProjectOpener } from '@acp-components/react';
import { SessionList } from '@acp-components/react';
import { ChatView } from '@acp-components/react';
import { PermissionDialog } from '@acp-components/react';
import { ConnectionStatus } from '@acp-components/react';
import { I18nProvider, useI18n } from '@acp-components/react';
import { useAcpStore, useSessions } from '@acp-components/react';
import { TauriIpcTransport } from './tauriIpcTransport';

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
    command: 'opencode',
    args: ['acp'],
  }),
};

function AppInner() {
  const activeSessionId = useAcpStore((s) => s.activeSessionId);
  const projectCwd = useAcpStore((s) => s.projectCwd);
  const agents = useAcpStore((s) => s.agents);
  const { refreshSessions } = useSessions();
  const prevCwd = useRef(projectCwd);

  useEffect(() => {
    if (prevCwd.current !== projectCwd) {
      prevCwd.current = projectCwd;
      for (const agentId of agents.keys()) {
        refreshSessions(agentId, projectCwd);
      }
    }
  }, [projectCwd, refreshSessions, agents]);

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
            <LocaleSwitcher />
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
    <I18nProvider>
      <AcpProvider
        agents={[{
          id: 'default',
          name: 'OpenCode',
          transport: transportConfig,
        }]}
        theme="dark"
      >
        <AppInner />
      </AcpProvider>
    </I18nProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
