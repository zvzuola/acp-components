import ReactDOM from 'react-dom/client';
import { useEffect, useRef } from 'react';
// @ts-expect-error Vite worker imports — types not available for ?worker suffix
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
// @ts-expect-error Vite worker imports
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
// @ts-expect-error Vite worker imports
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
// @ts-expect-error Vite worker imports
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
// @ts-expect-error Vite worker imports
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// Monaco requires MonacoEnvironment.getWorker to spawn language-specific web workers.
// Without this, Monaco falls back to running workers on the main thread (causing UI freezes)
// and fails on $loadForeignModule because FileAccessImpl.toUrl is unavailable outside a worker.
// @ts-expect-error Monaco global worker environment — typed by monaco-editor, not available here
self.MonacoEnvironment = {
  getWorker(_: string, label: string) {
    switch (label) {
      case 'json':
        return new jsonWorker();
      case 'css':
      case 'scss':
      case 'less':
        return new cssWorker();
      case 'html':
      case 'handlebars':
      case 'razor':
        return new htmlWorker();
      case 'typescript':
      case 'javascript':
        return new tsWorker();
      default:
        return new editorWorker();
    }
  },
};

import { AcpProvider } from '@acp-components/react';
import { Workbench } from '@acp-components/react';
import { Sidebar } from '@acp-components/react';
import { ChatView } from '@acp-components/react';
import { PermissionDialog } from '@acp-components/react';
import { LoginDialog } from '@acp-components/react';
import { FileViewer } from '@acp-components/react';
import { I18nProvider } from '@acp-components/react';
import { PlatformProvider } from '@acp-components/react';
import { useAcpStore } from '@acp-components/react';
import { useAcpContext } from '@acp-components/react';
import { useFileViewer } from '@acp-components/react';
import { usePlatform } from '@acp-components/react';
import { createWebPlatform } from './webPlatform';

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
  const workspaces = useAcpStore((s) => s.workspaces);
  const { addWorkspace } = useAcpContext();
  const platform = usePlatform();
  const loadedRef = useRef(false);
  // Show the panel only when at least one file is open. File-open state lives
  // in the global fileViewer store; we subscribe via the hook.
  const { openFiles } = useFileViewer();

  // Load cached workspaces on mount (once), then persist subsequent changes.
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    platform.loadWorkspaces?.().then((paths) => {
      for (const cwd of paths) addWorkspace(cwd);
    }).catch(console.error);
  }, [platform, addWorkspace]);

  useEffect(() => {
    platform.saveWorkspaces?.(Array.from(workspaces.keys())).catch(console.error);
  }, [platform, workspaces]);

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

function App() {
  return (
    <PlatformProvider platform={createWebPlatform()}>
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
    </PlatformProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
